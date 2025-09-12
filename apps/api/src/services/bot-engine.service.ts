import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import { TimerRegistryService } from './timer-registry.service';
import { BotProfilesService } from './bot-profiles.service';
import { TelemetryService } from './telemetry.service';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';

export type Phase = 'idle' | 'prepare' | 'buzzer_window' | 'answer_wait' | 'score_apply' | 'round_end' | 'final';

type RoomRuntime = {
  running: boolean;
  phase: Phase;
  until?: number;
  activePlayerId?: number | null;
  // Board state for the round
  board?: { title: string; values: number[] }[];
  // Current question info
  question?: { category: string; value: number; prompt: string } | undefined;
  // DB id of the current question if known (assigned or blitz)
  questionId?: string;
  // Super-game options for current question (if any)
  questionOptions?: string[];
  // Flag: current question is Super-game
  isSuperQuestion?: boolean;
  // Active DB session id for this room (spans multiple rounds)
  sessionId?: string;
  // Scoreboard for the room (playerId -> score)
  scores?: Record<number, number>;
  // Whether the last submitted answer (by activePlayerId) was correct
  lastAnswerCorrect?: boolean;
  // Whether the current human answerer already used the 1-letter retry
  retryUsed?: boolean;
  // Turn order and picking/answering state
  order?: number[];
  pickerIndex?: number; // index in order[] of who selects the question
  answerIndex?: number; // index in order[] of who currently answers
  questionStartPickerIndex?: number; // index in order[] who picked current question
  botProfiles?: Map<number, ReturnType<BotProfilesService['getAll']>[number]>; // mapping botId -> profile
  // Rounds and Super preselected cells per round
  round?: number; // 1-based
  superCells?: Map<number, Set<string>>; // round -> set of "category:value" keys that are Super
  // Blitz cells per round
  blitzCells?: Map<number, Set<string>>; // round -> set of "category:value" keys that are Blitz
  // Pre-assigned base question per board cell to avoid blitz collisions
  cellAssignments?: Map<number, Map<string, string>>; // round -> map of "category:value" -> questionId
  // Blitz runtime state
  blitzActive?: boolean;
  blitzOwnerId?: number;
  blitzIndex?: number; // 0-based
  blitzTotal?: number;
  blitzBaseValue?: number; // V from picked cell
  blitzCategory?: string;
  blitzQuestions?: { id: string; value: number; prompt: string }[];
};

@Injectable()
export class BotEngineService {
  private server: Server | null = null;
  private rooms = new Map<string, RoomRuntime>();
  private botPlayerIds = new Map<string, Map<string, number>>();
  private nextBotId = new Map<string, number>();
  private rng: () => number;

  // Config defaults (env overrides)
  private BUZZER_WINDOW_MS = this.intFromEnv('BUZZER_WINDOW_MS', 4500);
  private PREPARE_MS = this.intFromEnv('PREPARE_MS', 1500);
  // Solo mode answer timeouts
  // Backward-compat: if specific HUMAN/BOT vars are not provided, fall back to ANSWER_WAIT_MS
  private ANSWER_WAIT_HUMAN_MS = this.intFromEnv(
    'ANSWER_WAIT_HUMAN_MS',
    this.intFromEnv('ANSWER_WAIT_MS', 30000),
  );
  private ANSWER_WAIT_BOT_MS = this.intFromEnv(
    'ANSWER_WAIT_BOT_MS',
    this.intFromEnv('ANSWER_WAIT_MS', 15000),
  );
  private SCORE_APPLY_MS = this.intFromEnv('SCORE_APPLY_MS', 1000);
  // Allow pause in solo by default; can be disabled via env
  private SOLO_ALLOW_PAUSE = this.boolFromEnv('SOLO_ALLOW_PAUSE', true);
  private REVEAL_MS = this.intFromEnv('REVEAL_MS', 2500);
  // Super-game answer window (10–15s recommended)
  private SUPER_WAIT_MS = this.intFromEnv('SUPER_WAIT_MS', 12000);
  // Dev: emit correct answer for debugging in UI
  private DEBUG_ANSWER = this.boolFromEnv('DEBUG_ANSWER', false);
  // Blitz config
  private BLITZ_ENABLED = this.boolFromEnv('BLITZ_ENABLED', true);
  private BLITZ_ROUNDS: number[] = String(process.env.BLITZ_ROUNDS || '2')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  private BLITZ_CELLS_PER_ROUND = this.intFromEnv('BLITZ_CELLS_PER_ROUND', 1);
  private BLITZ_COUNT = this.intFromEnv('BLITZ_COUNT', 3);
  private BLITZ_TIMER_MS = this.intFromEnv('BLITZ_TIMER_MS', 15000);
  private BLITZ_RETRY_MS = this.intFromEnv('BLITZ_RETRY_MS', 7000);
  private BLITZ_SCORING_MODE = (process.env.BLITZ_SCORING_MODE || 'by_value') as 'by_value' | 'fixed';
  private BLITZ_FIXED_CORRECT = this.intFromEnv('BLITZ_FIXED_CORRECT', 200);
  private BLITZ_CORRECT_FACTOR = Number.isFinite(Number(process.env.BLITZ_CORRECT_FACTOR))
    ? Number(process.env.BLITZ_CORRECT_FACTOR)
    : 0.5;
  private BLITZ_WRONG_FACTOR = Number.isFinite(Number(process.env.BLITZ_WRONG_FACTOR))
    ? Number(process.env.BLITZ_WRONG_FACTOR)
    : -0.25;

  constructor(
    private timers: TimerRegistryService,
    private profiles: BotProfilesService,
    private telemetry: TelemetryService,
    private prisma: PrismaService,
    private redis: RedisService,
  ) {
    const seedEnv = process.env.BOT_RNG_SEED;
    const seed = seedEnv ? Number(seedEnv) : undefined;
    this.rng = typeof seed === 'number' && Number.isFinite(seed) ? this.seededRng(seed) : Math.random;
  }

  setServer(server: Server) {
    this.server = server;
  }

  isRunning(roomId: string) {
    const rr = this.rooms.get(roomId);
    return !!rr?.running;
  }

  start(roomId: string) {
    if (this.isRunning(roomId)) return;
    const rr: RoomRuntime = {
      running: true,
      phase: 'idle',
      until: undefined,
      activePlayerId: null,
      scores: {},
      round: 1,
      superCells: new Map(),
      blitzCells: new Map(),
      cellAssignments: new Map(),
    };
    this.rooms.set(roomId, rr);
    // Ensure DB session + board is ready and emit to clients
    void this.ensureSession(roomId)
      .then(() => this.ensureBoard(roomId))
      .then(() => this.emitBoardState(roomId));
    // Dynamic prepare window depending on whether humans are present
    void this.schedulePrepare(roomId);
    this.telemetry.soloStarted(roomId);
  }

  stop(roomId: string) {
    const rr = this.rooms.get(roomId);
    if (!rr) return;
    rr.running = false;
    this.timers.clearAll(roomId);
    // Mark DB session as completed if present
    if (rr.sessionId) {
      void this.prisma.roomSession
        .update({ where: { id: rr.sessionId }, data: { status: 'completed', endedAt: new Date() } })
        .catch(() => undefined);
    }
    this.rooms.delete(roomId);
    this.botPlayerIds.delete(roomId);
    this.nextBotId.delete(roomId);
  }

  pause(roomId: string) {
    if (!this.SOLO_ALLOW_PAUSE) return;
    this.timers.pause(roomId);
  }
  resume(roomId: string) {
    if (!this.SOLO_ALLOW_PAUSE) return;
    this.timers.resume(roomId);
  }

  // Buzzer no longer used in turn-based mode; kept for compatibility
  onHumanBuzzer(_roomId: string, _playerId: number) {
    return;
  }

  async onHumanAnswer(roomId: string, playerId: number, text: string) {
    const rr = this.rooms.get(roomId);
    if (!rr || rr.phase !== 'answer_wait') return;
    // Only the active player can answer
    if (rr.activePlayerId !== playerId) return;
    // Evaluate correctness from DB metadata when possible
    let correct = false;
    try {
      const q = rr.question;
      if (rr.questionId) {
        const qr = await this.prisma.question.findUnique({
          where: { id: rr.questionId },
          select: { canonicalAnswer: true, answersAccept: true, answersReject: true, requireFull: true },
        });
        const normalized = this.normalizeAnswer(text);
        const accepts = (qr?.answersAccept ?? []).map((s) => this.normalizeAnswer(s));
        const rejects = (qr?.answersReject ?? []).map((s) => this.normalizeAnswer(s));
        const canonical = this.normalizeAnswer(qr?.canonicalAnswer ?? '');
        const requireFull = Boolean(qr?.requireFull);
        if (normalized.length > 0) {
          if (rejects.includes(normalized)) correct = false;
          else if (requireFull) correct = accepts.includes(normalized) || (!!canonical && normalized === canonical);
          else correct = accepts.includes(normalized) || (!!canonical && normalized === canonical);
        }
      } else if (q?.category && typeof q.value === 'number') {
        const catRec = await this.prisma.category.findUnique({ where: { title: q.category } });
        if (catRec) {
          const qr = await this.prisma.question.findFirst({
            where: { categoryId: catRec.id, value: q.value },
            select: { canonicalAnswer: true, answersAccept: true, answersReject: true, requireFull: true },
          });
          const normalized = this.normalizeAnswer(text);
          const accepts = (qr?.answersAccept ?? []).map((s) => this.normalizeAnswer(s));
          const rejects = (qr?.answersReject ?? []).map((s) => this.normalizeAnswer(s));
          const canonical = this.normalizeAnswer(qr?.canonicalAnswer ?? '');
          const requireFull = Boolean(qr?.requireFull);
          if (normalized.length > 0) {
            if (rejects.includes(normalized)) correct = false;
            else if (requireFull) correct = accepts.includes(normalized) || (!!canonical && normalized === canonical);
            else correct = accepts.includes(normalized) || (!!canonical && normalized === canonical);
          }
        }
      }
    } catch {
      // Fallback: если не смогли проверить по БД — считаем ответ неверным,
      // чтобы избежать ложных начислений очков.
      correct = false;
    }
    if (correct) {
      rr.lastAnswerCorrect = true;
      this.goto(roomId, 'score_apply', Date.now() + this.SCORE_APPLY_MS);
      if (rr.blitzActive) {
        this.timers.set(roomId, 'phase_score_apply', this.SCORE_APPLY_MS, () => this.advanceAfterBlitzScore(roomId));
      } else {
        this.timers.set(roomId, 'phase_score_apply', this.SCORE_APPLY_MS, () => this.advanceAfterScore(roomId));
      }
      return;
    }
    // Not correct: check near-miss on first attempt to allow retry without penalty
    try {
      const q = rr.question;
      if (!rr.retryUsed && q?.category && typeof q.value === 'number') {
        const catRec = await this.prisma.category.findUnique({ where: { title: q.category } });
        const normalized = this.normalizeAnswer(text);
        if (catRec) {
          const qr = await this.prisma.question.findFirst({
            where: { categoryId: catRec.id, value: q.value },
            select: { canonicalAnswer: true },
          });
          const canonical = this.normalizeAnswer(qr?.canonicalAnswer ?? '');
          if (canonical && normalized) {
            const near = this.isNearMiss(normalized, canonical);
            if (near) {
              rr.retryUsed = true;
              this.server?.to(roomId).emit('answer:near_miss', { message: 'В слове ошибка, попробуйте ещё раз' } as any);
              if (rr.blitzActive) {
                rr.until = Date.now() + this.BLITZ_RETRY_MS;
                this.emitPhase(roomId, 'answer_wait', rr.until);
                this.timers.set(roomId, 'phase_answer_wait', this.BLITZ_RETRY_MS, () => {
                  const rrx = this.rooms.get(roomId);
                  if (!rrx || !rrx.blitzActive) return;
                  rrx.lastAnswerCorrect = false;
                  this.goto(roomId, 'score_apply', Date.now() + this.SCORE_APPLY_MS);
                  this.timers.set(roomId, 'phase_score_apply', this.SCORE_APPLY_MS, () => this.advanceAfterBlitzScore(roomId));
                });
              }
              return; // stay in answer_wait
            }
          }
        }
      }
    } catch { /* ignore near-miss errors */ }
    rr.lastAnswerCorrect = false;
    this.goto(roomId, 'score_apply', Date.now() + this.SCORE_APPLY_MS);
    if (rr.blitzActive) {
      this.timers.set(roomId, 'phase_score_apply', this.SCORE_APPLY_MS, () => this.advanceAfterBlitzScore(roomId));
    } else {
      this.timers.set(roomId, 'phase_score_apply', this.SCORE_APPLY_MS, () => this.advanceAfterScore(roomId));
    }
  }

  // Buzzer phase removed in new turn-based flow
  private async gotoBuzzer(_roomId: string) { return; }

  private cycleNext(_roomId: string) { /* deprecated */ }

  private scheduleBotBuzz(roomId: string) {
    // Load players from redis via attached server rooms metadata (we don't have redis here directly)
    // We will ask connected clients later if needed; for now, assume server exists and we can't read redis.
    // So GameGateway should call start() only when bots are present in players set.
    const bots = this.pickBotsForRoom(roomId);
    const rr = this.rooms.get(roomId);
    if (!rr) return;

    for (const bot of bots) {
      const [min, max] = bot.buzzReactionMs;
      const delay = Math.floor(min + this.rand() * (max - min));
      this.timers.set(roomId, `bot_buzz_${bot.code}`, delay, () => {
        const rrx = this.rooms.get(roomId);
        if (!rrx || rrx.phase !== 'buzzer_window' || rrx.activePlayerId) return;
        const category = rrx.question?.category ?? 'general';
        const value = rrx.question?.value ?? 0;
        const pKnow = this.estimateKnow(bot, category);
        const pBuzz = this.answerProbability(pKnow, value, bot.riskProfile);
        const blind = this.rand() < bot.blindBuzzRate;
        if (blind || this.rand() < pBuzz) {
          const playerId = this.getBotPlayerId(roomId, bot.code);
          rrx.activePlayerId = playerId;
          this.emitBotStatus(roomId, playerId, 'buzzed');
          this.telemetry.botBuzz(roomId, playerId);
          // Transition to answer wait (bots get a shorter window)
          this.goto(roomId, 'answer_wait', Date.now() + this.ANSWER_WAIT_BOT_MS);
          // Schedule bot think and answer
          const thinkMs = this.intFromEnv('BOT_THINK_MS', 900);
          this.emitBotStatus(roomId, playerId, 'thinking');
          this.timers.set(roomId, `bot_answer_${playerId}`, thinkMs, () => {
            const correct = this.rand() < Math.max(0.1, pKnow * (1 - bot.mistakeRate));
          this.emitBotStatus(roomId, playerId, 'answering');
          const rr2 = this.rooms.get(roomId);
          if (rr2) rr2.lastAnswerCorrect = correct;
          this.goto(roomId, 'score_apply', Date.now() + this.SCORE_APPLY_MS);
          this.timers.set(roomId, 'phase_score_apply', this.SCORE_APPLY_MS, () => this.advanceAfterScore(roomId));
          this.emitBotStatus(roomId, playerId, correct ? 'correct' : 'wrong');
          this.telemetry.botAnswer(roomId, playerId, correct ? 'correct' : 'wrong');
        });
        }
      });
    }
  }

  private estimateKnow(bot: ReturnType<BotProfilesService['getAll']>[number], category: string) {
    const byTag = bot.knowledgeByTag;
    const vals = Object.values(byTag);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0.5;
    const base = byTag[category] ?? byTag['general'] ?? avg;
    return bot.valueCurve === 'steep' ? Math.min(1, base * 1.1) : base;
  }

  private answerProbability(pKnow: number, value: number, risk: ReturnType<BotProfilesService['getAll']>[number]['riskProfile']) {
    const riskFactor = { low: 0.6, mid: 0.8, high: 1 }[risk];
    const valueFactor = 1 - Math.min(0.5, value / 2000);
    return Math.min(1, Math.max(0, pKnow * riskFactor * valueFactor));
  }

  private getBotPlayerId(roomId: string, botCode: string): number {
    let map = this.botPlayerIds.get(roomId);
    if (!map) {
      map = new Map();
      this.botPlayerIds.set(roomId, map);
    }
    const existing = map.get(botCode);
    if (typeof existing === 'number') return existing;
    const next = this.nextBotId.get(roomId) ?? -1;
    map.set(botCode, next);
    this.nextBotId.set(roomId, next - 1);
    return next;
  }

  private pickBotsForRoom(_roomId: string) {
    // Use first 2 profiles for MVP
    const all = this.profiles.getAll();
    return all.slice(0, 2);
  }

  private goto(roomId: string, phase: Phase, until?: number) {
    const rr = this.rooms.get(roomId);
    if (!rr) return;
    rr.phase = phase;
    rr.until = until;
    // Scoring: adjust score when entering score_apply
    if (phase === 'score_apply') {
      const pid = rr.activePlayerId;
      const val = rr.question?.value ?? 0;
      if (pid != null && typeof val === 'number' && val > 0) {
        rr.scores = rr.scores || {};
        if (typeof rr.lastAnswerCorrect === 'boolean') {
          let delta = 0;
          if (rr.blitzActive) {
            const base = rr.blitzBaseValue ?? val;
            if (this.BLITZ_SCORING_MODE === 'fixed') {
              delta = rr.lastAnswerCorrect ? this.BLITZ_FIXED_CORRECT : Math.round(this.BLITZ_FIXED_CORRECT * (this.BLITZ_WRONG_FACTOR));
            } else {
              // by value factors
              delta = rr.lastAnswerCorrect
                ? Math.round(base * this.BLITZ_CORRECT_FACTOR)
                : Math.round(base * this.BLITZ_WRONG_FACTOR);
            }
          } else {
            // Double points starting from round 2
            const factor = (rr.round ?? 1) >= 2 ? 2 : 1;
            if (rr.lastAnswerCorrect) {
              delta = val * factor;
            } else {
              delta = rr.isSuperQuestion ? -Math.round((val * factor) / 2) : -(val * factor);
            }
          }
          rr.scores[pid] = (rr.scores[pid] ?? 0) + delta;
        }
        // do not reset here; advanceAfterScore will manage correctness lifecycle
      }
    }
    this.emitPhase(roomId, phase, until);
  }

  private emitPhase(roomId: string, phase: Phase, until?: number) {
    const rr = this.rooms.get(roomId);
    const activePlayerId = rr?.activePlayerId ?? null;
    const question = rr?.question
      ? { ...rr.question, ...(Array.isArray(rr.questionOptions) ? { options: rr.questionOptions } : {}) }
      : undefined;
    const scores = rr?.scores ? { ...rr.scores } : undefined;
    const mode = rr?.blitzActive ? 'blitz' : 'normal';
    const blitz = rr?.blitzActive
      ? { index: (rr.blitzIndex ?? 0) + 1, total: rr.blitzTotal ?? 0, ownerPlayerId: rr.blitzOwnerId ?? 0, timerMs: this.BLITZ_TIMER_MS }
      : undefined;
    this.server?.to(roomId).emit('game:phase', { roomId, phase, until, activePlayerId, question, scores, mode, blitz } as any);
  }

  private emitBotStatus(roomId: string, playerId: number, status: 'idle' | 'thinking' | 'buzzed' | 'answering' | 'passed' | 'wrong' | 'correct') {
    this.server?.to(roomId).emit('bot:status', { roomId, playerId, status, at: Date.now() } as any);
  }

  private emitBoardState(roomId: string) {
    const rr = this.rooms.get(roomId);
    const round = rr?.round ?? 1;
    const blitzSet = rr?.blitzCells?.get(round) ?? new Set<string>();
    const categories = (rr?.board ?? []).map((c) => {
      const blitzValues = c.values.filter((v) => blitzSet.has(`${c.title}:${v}`));
      return blitzValues.length ? { ...c, blitzValues } : { ...c };
    });
    this.server?.to(roomId).emit('board:state', { roomId, round, categories } as any);
  }

  private buildMaskPayload(answer: string) {
    // Build mask: letters/digits -> '*', keep spaces and hyphens
    const chars = Array.from(answer);
    const isFillable = (ch: string) => /[\p{L}\p{N}]/u.test(ch) && ch !== ' ' && ch !== '-';
    let len = 0;
    const mask = chars
      .map((ch) => {
        if (ch === ' ' || ch === '-') return ch;
        if (isFillable(ch)) {
          len += 1;
          return '*';
        }
        // Hide other punctuation as '*'
        len += 1;
        return '*';
      })
      .join('');
    return { len, mask, canReveal: false };
  }

  private async onEnterAnswerWait(roomId: string) {
    const rr = this.rooms.get(roomId);
    if (!rr) return;
    // Reset retry flag for the new answerer window
    rr.retryUsed = false;
    const activeId = rr.activePlayerId;
    const isHuman = typeof activeId === 'number' ? activeId >= 0 : false;
    if (!isHuman) return; // Only reveal mask to humans
    try {
      let answer = '';
      if (rr.questionId) {
        answer = await this.loadAnswerById(rr.questionId);
      } else {
        const cat = rr.question?.category;
        const val = rr.question?.value;
        if (!cat || typeof val !== 'number') return;
        answer = await this.loadAnswer(cat, val);
      }
      if (!answer) return;
      const payload = this.buildMaskPayload(answer);
      this.server?.to(roomId).emit('word:mask', payload as any);
      if (this.DEBUG_ANSWER) {
        try {
          this.server?.to(roomId).emit('answer:debug', { text: answer } as any);
        } catch {}
      }
    } catch {
      // ignore mask errors
    }
  }

  private isNearMiss(a: string, b: string) {
    // Check if Levenshtein distance is exactly 1 (one insertion, deletion, or substitution)
    if (a === b) return false;
    const la = a.length, lb = b.length;
    const diff = Math.abs(la - lb);
    if (diff > 1) return false;
    // If equal length: at most one mismatched position
    if (la === lb) {
      let mismatches = 0;
      for (let i = 0; i < la; i++) {
        if (a[i] !== b[i]) {
          mismatches++;
          if (mismatches > 1) return false;
        }
      }
      return mismatches === 1;
    }
    // Ensure a is shorter
    const s = la < lb ? a : b;
    const t = la < lb ? b : a;
    let i = 0, j = 0, edits = 0;
    while (i < s.length && j < t.length) {
      if (s[i] === t[j]) {
        i++; j++;
      } else {
        edits++;
        if (edits > 1) return false;
        j++; // skip one char in longer string (insertion/deletion)
      }
    }
    // If there is one char left in longer string, that's the single edit
    if (j < t.length || i < s.length) edits++;
    return edits === 1;
  }

  private async ensureBoard(roomId: string) {
    const rr = this.rooms.get(roomId);
    if (!rr) return;
    if (rr.board && rr.board.some((c) => c.values.length > 0)) return;
    // If board existed but is now empty, advance round
    if (rr.board && rr.board.every((c) => c.values.length === 0)) {
      rr.round = (rr.round ?? 1) + 1;
      // End game after finishing 2 rounds
      if ((rr.round ?? 1) > 2) {
        rr.activePlayerId = null;
        this.timers.clearAll(roomId);
        this.goto(roomId, 'final');
        return;
      }
    }
    // Load first 4 categories with up to 5 values each
    const cats = await this.prisma.category.findMany({
      take: 4,
      orderBy: { createdAt: 'asc' },
      include: {
        questions: { select: { value: true }, orderBy: { value: 'asc' }, take: 5 },
      },
    });
    rr.board = cats.map((c: { title: string; questions: { value: number }[] }) => ({
      title: c.title,
      values: Array.from(new Set(c.questions.map((q: { value: number }) => q.value)))
        .sort((a: number, b: number) => a - b)
        .slice(0, 5),
    }));
    // Ensure Super assignments for this round exist in DB and sync into runtime
    await this.ensureSuperAssignmentsForRound(roomId);
    // Blitz cells for this round
    await this.ensureBlitzAssignmentsForRound(roomId);
    // Pre-assign base question for each board cell (avoid Blitz collisions)
    await this.ensureCellAssignmentsForRound(roomId);
  }

  private async loadQuestion(categoryTitle: string, value: number) {
    const catRec = await this.prisma.category.findUnique({ where: { title: categoryTitle } });
    if (catRec) {
      const q = await this.prisma.question.findFirst({
        where: { categoryId: catRec.id, value },
        orderBy: { createdAt: 'asc' },
        select: { prompt: true },
      });
      return { category: categoryTitle, value, prompt: q?.prompt || `${categoryTitle} — ${value}` };
    }
    return { category: categoryTitle, value, prompt: `${categoryTitle} — ${value}` };
  }

  private async ensureQuestionSelected(roomId: string) {
    const rr = this.rooms.get(roomId);
    if (!rr) return;
    if (rr.question) return;
    await this.ensureBoard(roomId);
    const candidates = (rr.board ?? []).filter((c) => c.values.length > 0);
    if (!candidates.length) return;
    // Pick a random category and a random available value within it
    const cat = candidates[Math.floor(this.rand() * candidates.length)];
    const vIdx = Math.floor(this.rand() * cat.values.length);
    const value = cat.values[vIdx];
    // remove from board
    cat.values = cat.values.filter((v, i) => i !== vIdx);
    this.emitBoardState(roomId);
    // load prompt
    rr.question = await this.loadQuestion(cat.title, value);
  }

  private async loadAnswer(categoryTitle: string, value: number) {
    try {
      const catRec = await this.prisma.category.findUnique({ where: { title: categoryTitle } });
      if (!catRec) return '';
      const q = await this.prisma.question.findFirst({
        where: { categoryId: catRec.id, value },
        orderBy: { createdAt: 'asc' },
        select: { canonicalAnswer: true, rawAnswer: true, answersAccept: true },
      });
      if (!q) return '';
      const ca: any = (q as any).canonicalAnswer;
      const ra: any = (q as any).rawAnswer;
      const acc: any = (q as any).answersAccept;
      if (typeof ca === 'string' && ca.trim()) return ca.trim();
      if (typeof ra === 'string' && ra.trim()) return ra.trim();
      if (Array.isArray(acc) && acc.length && typeof acc[0] === 'string') return acc[0];
      return '';
    } catch {
      return '';
    }
  }

  async onBoardPick(roomId: string, categoryTitle: string, value: number, pickerId?: number) {
    const rr = this.rooms.get(roomId);
    if (!rr || !rr.running) return;
    if (rr.phase !== 'prepare') return;
    // Only current picker can pick
    if (typeof pickerId === 'number') {
      const currentPickerId = this.getCurrentPickerId(roomId);
      if (currentPickerId == null || currentPickerId !== pickerId) return;
    }
    // Ensure board exists
    await this.ensureBoard(roomId);
    const cat = rr.board?.find((c) => c.title === categoryTitle);
    if (!cat) return;
    const idx = cat.values.findIndex((v) => v === value);
    if (idx === -1) return; // already taken or invalid
    // Remove from available
    cat.values.splice(idx, 1);
    this.emitBoardState(roomId);
    // Load question prompt
    rr.question = await this.loadQuestion(categoryTitle, value);
    rr.questionId = this.getAssignedQuestionId(roomId, categoryTitle, value) ?? undefined;
    // Blitz takes precedence
    if (this.shouldTriggerBlitz(rr, categoryTitle, value)) {
      await this.startBlitz(roomId, pickerId ?? this.getCurrentPickerId(roomId) ?? 0, categoryTitle, value);
      return;
    }
    // Super-game decision and options
    rr.isSuperQuestion = this.shouldTriggerSuper(rr, categoryTitle, value);
    if (rr.isSuperQuestion) {
      try {
        rr.questionOptions = await this.buildSuperOptionsDbFirst(roomId, categoryTitle, value);
      } catch {
        rr.isSuperQuestion = false;
        rr.questionOptions = undefined;
      }
    } else {
      rr.questionOptions = undefined;
    }
    // Clear any pending prepare timers to avoid duplicate transitions
    this.timers.clearAll(roomId);
    // Set answering order starting from picker
    await this.ensureOrder(roomId);
    rr.questionStartPickerIndex = rr.pickerIndex ?? 0;
    rr.answerIndex = rr.questionStartPickerIndex;
    const pid = this.getCurrentAnswererId(roomId);
    rr.activePlayerId = pid ?? null;
    const isBot = typeof pid === 'number' ? pid < 0 : false;
    const waitMs = rr.isSuperQuestion
      ? this.SUPER_WAIT_MS
      : isBot
      ? this.ANSWER_WAIT_BOT_MS
      : this.ANSWER_WAIT_HUMAN_MS;
    this.goto(roomId, 'answer_wait', Date.now() + waitMs);
    void this.onEnterAnswerWait(roomId);
    if (isBot && typeof pid === 'number') {
      this.scheduleBotThinkAndAnswer(roomId, pid);
    } else {
      // Human timeout -> move to score apply (as wrong/timeout)
      this.timers.set(roomId, 'phase_answer_wait', waitMs, () => {
        const rrx = this.rooms.get(roomId);
        if (!rrx || rrx.phase !== 'answer_wait' || rrx.activePlayerId !== pid) return;
        rrx.lastAnswerCorrect = false; // treat timeout as wrong
        this.goto(roomId, 'score_apply', Date.now() + this.SCORE_APPLY_MS);
        this.timers.set(roomId, 'phase_score_apply', this.SCORE_APPLY_MS, () => this.advanceAfterScore(roomId));
      });
    }
  }

  // Public helper to (re)send board state to clients (e.g., on join)
  async publishBoardState(roomId: string) {
    await this.ensureBoard(roomId);
    this.emitBoardState(roomId);
  }

  // Schedules the prepare phase with dynamic duration:
  // - If there is at least one human player in the room: up to 12s for manual pick
  // - If only bots are present: 4..6s (random) auto-pick window
  private async schedulePrepare(roomId: string) {
    await this.ensureOrder(roomId);
    const rr = this.rooms.get(roomId);
    if (!rr) return;
    // Do not schedule if game is over
    if (rr.phase === 'final') return;
    const pickerId = this.getCurrentPickerId(roomId);
    rr.activePlayerId = pickerId ?? null; // indicate who chooses
    const ms = await this.computePrepareMs(roomId);
    this.goto(roomId, 'prepare', Date.now() + ms);

    const isBot = typeof pickerId === 'number' ? pickerId < 0 : false;
    if (isBot) {
      // Bot will pick automatically after its window
      this.timers.set(roomId, 'phase_prepare', ms, () => {
        this.botAutoPick(roomId);
      });
    } else {
      // Human didn't pick in time -> pass pick to next player and reschedule
      this.timers.set(roomId, 'phase_prepare', ms, () => {
        const rrx = this.rooms.get(roomId);
        if (!rrx?.running) return;
        rrx.pickerIndex = this.nextIndexInOrder(roomId, rrx.pickerIndex ?? 0);
        this.schedulePrepare(roomId);
      });
    }
  }

  private async computePrepareMs(roomId: string) {
    // Use picker identity: human => 12s, bot => 4..6s
    const pickerId = this.getCurrentPickerId(roomId);
    const isBot = typeof pickerId === 'number' ? pickerId < 0 : false;
    if (!isBot) return this.intFromEnv('PREPARE_HUMAN_MS', 12000);
    const min = this.intFromEnv('PREPARE_BOT_MIN_MS', 4000);
    const max = this.intFromEnv('PREPARE_BOT_MAX_MS', 6000);
    const span = Math.max(0, max - min);
    return min + Math.floor(this.rand() * (span || 1));
  }

  private async ensureOrder(roomId: string) {
    const rr = this.rooms.get(roomId);
    if (!rr) return;
    if (rr.order && typeof rr.pickerIndex === 'number') return;
    const raw = await this.redis.client.smembers(`room:${roomId}:players`);
    const players = raw
      .map((m) => {
        try { return JSON.parse(m) as { id: number; bot?: boolean }; } catch { return null; }
      })
      .filter((x): x is { id: number; bot?: boolean } => !!x);
    const humans = players.filter((p) => !p.bot);
    const bots = players.filter((p) => p.bot);
    const order = [...humans, ...bots].map((p) => p.id);
    rr.order = order;
    // First picker is the first human if present, otherwise first in list
    const firstHumanIdx = order.findIndex((id) => id >= 0);
    rr.pickerIndex = firstHumanIdx >= 0 ? firstHumanIdx : 0;
    // Map bot profiles by player id
    const profiles = this.profiles.getAll();
    const mp = new Map<number, ReturnType<BotProfilesService['getAll']>[number]>();
    let i = 0;
    for (const b of bots) {
      const prof = profiles[i % Math.max(1, profiles.length)];
      mp.set(b.id, prof);
      i++;
    }
    rr.botProfiles = mp;
  }

  private getCurrentPickerId(roomId: string) {
    const rr = this.rooms.get(roomId);
    if (!rr?.order?.length) return null;
    const idx = rr.pickerIndex ?? 0;
    return rr.order[idx] ?? null;
  }

  private getCurrentAnswererId(roomId: string) {
    const rr = this.rooms.get(roomId);
    if (!rr?.order?.length) return null;
    const idx = rr.answerIndex ?? rr.pickerIndex ?? 0;
    return rr.order[idx] ?? null;
  }

  private nextIndexInOrder(roomId: string, idx: number) {
    const rr = this.rooms.get(roomId);
    const len = rr?.order?.length ?? 0;
    if (!len) return 0;
    return (idx + 1) % len;
  }

  private async botAutoPick(roomId: string) {
    const rr = this.rooms.get(roomId);
    if (!rr?.running) return;
    // Ensure board is available
    await this.ensureBoard(roomId);
    const candidates = (rr.board ?? []).filter((c) => c.values.length > 0);
    if (!candidates.length) {
      // No questions available -> move picker to next and schedule again
      rr.pickerIndex = this.nextIndexInOrder(roomId, rr.pickerIndex ?? 0);
      await this.schedulePrepare(roomId);
      return;
    }
    const cat = candidates[Math.floor(this.rand() * candidates.length)];
    const vIdx = Math.floor(this.rand() * cat.values.length);
    const value = cat.values[vIdx];
    // remove from board
    cat.values.splice(vIdx, 1);
    this.emitBoardState(roomId);
    // load prompt
    rr.question = await this.loadQuestion(cat.title, value);
    rr.questionStartPickerIndex = rr.pickerIndex ?? 0;
    rr.answerIndex = rr.pickerIndex ?? 0;
    const pid = this.getCurrentAnswererId(roomId);
    rr.activePlayerId = pid ?? null;
    const waitMs = this.ANSWER_WAIT_BOT_MS;
    this.goto(roomId, 'answer_wait', Date.now() + waitMs);
    void this.onEnterAnswerWait(roomId);
    if (typeof pid === 'number') this.scheduleBotThinkAndAnswer(roomId, pid);
  }

  private scheduleBotThinkAndAnswer(roomId: string, botPlayerId: number) {
    const rr = this.rooms.get(roomId);
    if (!rr) return;
    const thinkMs = this.intFromEnv('BOT_THINK_MS', 900);
    this.emitBotStatus(roomId, botPlayerId, 'thinking');
    const category = rr.question?.category ?? 'general';
    const value = rr.question?.value ?? 0;
    const profile = rr.botProfiles?.get(botPlayerId) ?? this.profiles.getAll()[0];
    const pKnow = this.estimateKnow(profile, category);
    const pAns = this.answerProbability(pKnow, value, profile.riskProfile);
    this.timers.set(roomId, `bot_answer_${botPlayerId}`, thinkMs, () => {
      const correct = this.rand() < Math.max(0.1, pKnow * (1 - profile.mistakeRate)) && this.rand() < pAns;
      this.emitBotStatus(roomId, botPlayerId, 'answering');
      const rr2 = this.rooms.get(roomId);
      if (rr2) rr2.lastAnswerCorrect = correct;
      this.goto(roomId, 'score_apply', Date.now() + this.SCORE_APPLY_MS);
      this.timers.set(roomId, 'phase_score_apply', this.SCORE_APPLY_MS, () => this.advanceAfterScore(roomId));
      this.emitBotStatus(roomId, botPlayerId, correct ? 'correct' : 'wrong');
      this.telemetry.botAnswer(roomId, botPlayerId, correct ? 'correct' : 'wrong');
    });
  }

  private advanceAfterScore(roomId: string) {
    const rr = this.rooms.get(roomId);
    if (!rr?.running) return;
    const len = rr.order?.length ?? 0;
    if (!len) return;
    const correct = rr.lastAnswerCorrect === true;
    const currAnswerIdx = rr.answerIndex ?? (rr.pickerIndex ?? 0);
    const startIdx = rr.questionStartPickerIndex ?? (rr.pickerIndex ?? 0);
    // Clear flag for next step
    rr.lastAnswerCorrect = undefined;
    if (correct) {
      // The same player becomes the next picker
      rr.pickerIndex = currAnswerIdx;
      rr.question = undefined;
      rr.questionOptions = undefined;
      rr.isSuperQuestion = undefined;
      rr.activePlayerId = null;
      void this.ensureBoard(roomId).then(() => this.emitBoardState(roomId));
      void this.schedulePrepare(roomId);
      return;
    }
    // Super-game: do not pass to others on wrong/timeout
    if (rr.isSuperQuestion) {
      const cat = rr.question?.category ?? 'unknown';
      const val = rr.question?.value ?? 0;
      void this.loadAnswer(cat, val).then((text) => {
        try {
          this.server?.to(roomId).emit('answer:reveal', { roomId, category: cat, value: val, text } as any);
        } catch {}
      });
      this.goto(roomId, 'round_end', Date.now() + this.REVEAL_MS);
      this.timers.set(roomId, 'phase_round_end', this.REVEAL_MS, () => {
        const rrx = this.rooms.get(roomId);
        if (!rrx?.running) return;
        rrx.question = undefined;
        rrx.questionOptions = undefined;
        rrx.isSuperQuestion = undefined;
        rrx.activePlayerId = null;
        rrx.pickerIndex = this.nextIndexInOrder(roomId, startIdx);
        void this.ensureBoard(roomId).then(() => this.emitBoardState(roomId));
        void this.schedulePrepare(roomId);
      });
      return;
    }
    // Incorrect or timeout -> move to next answerer if any
    if (currAnswerIdx < len - 1) {
      rr.answerIndex = currAnswerIdx + 1;
      const nextId = this.getCurrentAnswererId(roomId);
      rr.activePlayerId = nextId ?? null;
      const isBot = typeof nextId === 'number' ? nextId < 0 : false;
      const wait = isBot ? this.ANSWER_WAIT_BOT_MS : this.ANSWER_WAIT_HUMAN_MS;
      this.goto(roomId, 'answer_wait', Date.now() + wait);
      void this.onEnterAnswerWait(roomId);
      if (isBot && typeof nextId === 'number') {
        this.scheduleBotThinkAndAnswer(roomId, nextId);
      } else {
        // Human timeout path
        this.timers.set(roomId, 'phase_answer_wait', wait, () => {
          const rrx = this.rooms.get(roomId);
          if (!rrx || rrx.phase !== 'answer_wait' || rrx.activePlayerId !== nextId) return;
          rrx.lastAnswerCorrect = false;
          this.goto(roomId, 'score_apply', Date.now() + this.SCORE_APPLY_MS);
          this.timers.set(roomId, 'phase_score_apply', this.SCORE_APPLY_MS, () => this.advanceAfterScore(roomId));
        });
      }
      return;
    }
    // Last player also failed -> reveal answer, then advance picker to next player
    const cat = rr.question?.category ?? 'unknown';
    const val = rr.question?.value ?? 0;
    void this.loadAnswer(cat, val).then((text) => {
      try {
        this.server?.to(roomId).emit('answer:reveal', { roomId, category: cat, value: val, text } as any);
      } catch {}
    });
    this.goto(roomId, 'round_end', Date.now() + this.REVEAL_MS);
    this.timers.set(roomId, 'phase_round_end', this.REVEAL_MS, () => {
      const rrx = this.rooms.get(roomId);
      if (!rrx?.running) return;
      rrx.question = undefined;
      rrx.questionOptions = undefined;
      rrx.isSuperQuestion = undefined;
      rrx.activePlayerId = null;
      rrx.pickerIndex = this.nextIndexInOrder(roomId, startIdx);
      void this.ensureBoard(roomId).then(() => this.emitBoardState(roomId));
      void this.schedulePrepare(roomId);
    });
  }

  private async loadAnswerById(questionId: string) {
    try {
      const q = await this.prisma.question.findUnique({
        where: { id: questionId },
        select: { canonicalAnswer: true, rawAnswer: true, answersAccept: true },
      });
      if (!q) return '';
      const ca: any = (q as any).canonicalAnswer;
      const ra: any = (q as any).rawAnswer;
      const acc: any = (q as any).answersAccept;
      if (typeof ca === 'string' && ca.trim()) return ca.trim();
      if (typeof ra === 'string' && ra.trim()) return ra.trim();
      if (Array.isArray(acc) && acc.length && typeof acc[0] === 'string') return acc[0];
      return '';
    } catch {
      return '';
    }
  }

  private shouldTriggerSuper(rr: RoomRuntime, categoryTitle: string, value: number) {
    const round = rr.round ?? 1;
    const key = `${categoryTitle}:${value}`;
    const set = rr.superCells?.get(round);
    if (!set) return false;
    return set.has(key);
  }

  private async seedSuperForRound(roomId: string) {
    const rr = this.rooms.get(roomId);
    if (!rr?.board) return;
    const round = rr.round ?? 1;
    rr.superCells = rr.superCells ?? new Map();
    if (rr.superCells.has(round)) return; // already seeded for this round

    const cells400: string[] = [];
    const cells200: string[] = [];
    for (const c of rr.board) {
      for (const v of c.values) {
        if (v === 400) cells400.push(`${c.title}:${v}`);
        if (v === 200) cells200.push(`${c.title}:${v}`);
      }
    }

    const picks = new Set<string>();
    const pickRandom = (arr: string[]) => {
      if (!arr.length) return undefined;
      const idx = Math.floor(this.rand() * arr.length);
      return arr[idx];
    };

    if (round === 1) {
      const p400 = pickRandom(cells400);
      if (p400) picks.add(p400);
    } else if (round === 2) {
      const p200 = pickRandom(cells200);
      const p400 = pickRandom(cells400);
      if (p200) picks.add(p200);
      if (p400) picks.add(p400);
    }

    rr.superCells.set(round, picks);
  }

  // DB-backed: ensure RoomSession exists and Super assignments are persisted per round.
  // Mirrors the assignments into rr.superCells for fast checks.
  private async ensureSuperAssignmentsForRound(roomId: string) {
    const rr = this.rooms.get(roomId);
    if (!rr?.board) return;
    await this.ensureSession(roomId);
    const round = rr.round ?? 1;
    rr.superCells = rr.superCells ?? new Map();
    if (rr.superCells.has(round)) return;

    const categories = await this.prisma.category.findMany({ select: { id: true, title: true } });
    const catByTitle = new Map(categories.map((c) => [c.title, c.id] as const));
    const sessionId = rr.sessionId;
    if (!sessionId) return;

    const existing = await this.prisma.roomSuperCell.findMany({ where: { sessionId, round } });
    const toKey = (catId: string, value: number) => {
      const title = categories.find((c) => c.id === catId)?.title;
      return title ? `${title}:${value}` : '';
    };
    let picks = new Set<string>(existing.map((e) => toKey(e.categoryId, e.value)).filter(Boolean) as string[]);

    if (picks.size === 0) {
      const allowedByRound: Record<number, number[]> = { 1: [400], 2: [200, 400] };
      const allowedValues = allowedByRound[round] ?? [400];
      type Cell = { title: string; value: number; categoryId: string };
      const allCells: Cell[] = [];
      for (const bc of rr.board) {
        const cid = catByTitle.get(bc.title);
        if (!cid) continue;
        for (const v of bc.values) {
          if (!allowedValues.includes(v)) continue;
          allCells.push({ title: bc.title, value: v, categoryId: cid });
        }
      }
      const used = new Set((await this.prisma.roomSuperCell.findMany({ where: { sessionId }, select: { superQuestionId: true } })).map((x) => x.superQuestionId));

      const pickSuperForCell = async (cell: Cell) => {
        const pool = await this.prisma.superQuestion.findMany({
          where: { enabled: true, Question: { categoryId: cell.categoryId, value: cell.value } },
          select: { id: true, lastUsedAt: true },
          orderBy: [{ lastUsedAt: 'asc' }],
          take: 50,
        });
        const candidates = pool.filter((sq) => !used.has(sq.id));
        if (!candidates.length) return null;
        const top = candidates.slice(0, Math.min(5, candidates.length));
        return top[Math.floor(this.rand() * top.length)]!;
      };

      const already = new Set<string>();
      for (const val of allowedValues) {
        const cells = allCells.filter((c) => c.value === val && !already.has(`${c.title}:${c.value}`));
        let chosenCell: Cell | null = null;
        let chosenSq: { id: string } | null = null;
        for (const cell of cells) {
          const sq = await pickSuperForCell(cell);
          if (sq) { chosenCell = cell; chosenSq = sq; break; }
        }
        if (!chosenCell || !chosenSq) continue;
        try {
          await this.prisma.$transaction([
            this.prisma.roomSuperCell.create({ data: { sessionId, round, categoryId: chosenCell.categoryId, value: chosenCell.value, superQuestionId: chosenSq.id } }),
            this.prisma.superQuestion.update({ where: { id: chosenSq.id }, data: { lastUsedAt: new Date() } }),
          ]);
          used.add(chosenSq.id);
          already.add(`${chosenCell.title}:${chosenCell.value}`);
        } catch {}
      }
      const newly = await this.prisma.roomSuperCell.findMany({ where: { sessionId, round } });
      picks = new Set<string>(newly.map((e) => toKey(e.categoryId, e.value)).filter(Boolean) as string[]);
    }

    rr.superCells.set(round, picks);
  }

  // Blitz: seed which cells in the current round are Blitz
  private async ensureBlitzAssignmentsForRound(roomId: string) {
    if (!this.BLITZ_ENABLED) return;
    const rr = this.rooms.get(roomId);
    if (!rr?.board) return;
    const round = rr.round ?? 1;
    // Only seed on configured rounds
    if (!this.BLITZ_ROUNDS.includes(round)) return;
    rr.blitzCells = rr.blitzCells ?? new Map();
    if (rr.blitzCells.has(round)) return;
    const allCells: string[] = [];
    for (const c of rr.board) for (const v of c.values) allCells.push(`${c.title}:${v}`);
    const picks = new Set<string>();
    const n = Math.max(0, this.BLITZ_CELLS_PER_ROUND);
    const pool = allCells.slice();
    for (let i = 0; i < n && pool.length > 0; i++) {
      const idx = Math.floor(this.rand() * pool.length);
      const [key] = pool.splice(idx, 1);
      picks.add(String(key));
    }
    rr.blitzCells.set(round, picks);
  }

  // Pre-assign a base question record id for each board cell (category:value)
  private async ensureCellAssignmentsForRound(roomId: string) {
    const rr = this.rooms.get(roomId);
    if (!rr?.board) return;
    const round = rr.round ?? 1;
    rr.cellAssignments = rr.cellAssignments ?? new Map();
    if (!rr.cellAssignments.has(round)) rr.cellAssignments.set(round, new Map());
    const map = rr.cellAssignments.get(round)!;
    for (const c of rr.board) {
      const cat = await this.prisma.category.findUnique({ where: { title: c.title } });
      if (!cat) continue;
      for (const v of c.values) {
        const key = `${c.title}:${v}`;
        if (map.has(key)) continue;
        const base = await this.prisma.question.findFirst({
          where: { categoryId: cat.id, value: v },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (base?.id) map.set(key, base.id);
      }
    }
  }

  private getAssignedQuestionId(roomId: string, categoryTitle: string, value: number) {
    const rr = this.rooms.get(roomId);
    const round = rr?.round ?? 1;
    const map = rr?.cellAssignments?.get(round);
    const key = `${categoryTitle}:${value}`;
    return map?.get(key);
  }

  private shouldTriggerBlitz(rr: RoomRuntime, categoryTitle: string, value: number) {
    if (!this.BLITZ_ENABLED) return false;
    const round = rr.round ?? 1;
    if (!this.BLITZ_ROUNDS.includes(round)) return false;
    const set = rr.blitzCells?.get(round);
    if (!set) return false;
    return set.has(`${categoryTitle}:${value}`);
  }

  private async startBlitz(roomId: string, ownerId: number, categoryTitle: string, maxValue: number) {
    const rr = this.rooms.get(roomId);
    if (!rr) return;
    rr.blitzActive = true;
    rr.blitzOwnerId = ownerId;
    rr.blitzIndex = 0;
    rr.blitzTotal = this.BLITZ_COUNT;
    rr.blitzBaseValue = maxValue;
    rr.blitzCategory = categoryTitle;
    rr.isSuperQuestion = false;
    rr.questionOptions = undefined;
    rr.activePlayerId = ownerId;
    // Build blitz questions list
    rr.blitzQuestions = await this.buildBlitzQuestions(roomId, categoryTitle, maxValue, this.BLITZ_COUNT);
    // Kick off first question
    await this.startBlitzQuestion(roomId);
  }

  private async buildBlitzQuestions(roomId: string, categoryTitle: string, maxValue: number, count: number) {
    const rr = this.rooms.get(roomId);
    const res: { id: string; value: number; prompt: string }[] = [];
    const assignedIds = new Set<string>();
    const round = rr?.round ?? 1;
    const map = rr?.cellAssignments?.get(round) ?? new Map<string, string>();
    // Collect assigned questionIds for this category and allowed values to exclude
    for (const [key, qid] of map.entries()) {
      const [cat, valStr] = key.split(':');
      const val = Number(valStr);
      if (cat === categoryTitle && Number.isFinite(val) && val <= maxValue && qid) assignedIds.add(qid);
    }
    const catRec = await this.prisma.category.findUnique({ where: { title: categoryTitle } });
    if (!catRec) return res;
    const pool = await this.prisma.question.findMany({
      where: { categoryId: catRec.id, value: { lte: maxValue } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, value: true, prompt: true },
      take: 100,
    });
    const candidates = pool.filter((q) => !assignedIds.has(q.id));
    const bag = candidates.slice();
    while (res.length < count && bag.length > 0) {
      const idx = Math.floor(this.rand() * bag.length);
      const [pick] = bag.splice(idx, 1);
      res.push({ id: pick.id, value: pick.value as number, prompt: pick.prompt as any });
    }
    return res;
  }

  private async startBlitzQuestion(roomId: string) {
    const rr = this.rooms.get(roomId);
    if (!rr || !rr.blitzActive) return;
    const i = rr.blitzIndex ?? 0;
    const item = rr.blitzQuestions?.[i];
    if (!item) {
      await this.endBlitz(roomId);
      return;
    }
    rr.question = { category: rr.blitzCategory || '', value: item.value, prompt: item.prompt };
    rr.questionId = item.id;
    rr.activePlayerId = rr.blitzOwnerId ?? null;
    // Emit phase with Blitz mode
    this.goto(roomId, 'answer_wait', Date.now() + this.BLITZ_TIMER_MS);
    void this.onEnterAnswerWait(roomId);
    // Timeout handler
    this.timers.set(roomId, 'phase_answer_wait', this.BLITZ_TIMER_MS, () => {
      const rrx = this.rooms.get(roomId);
      if (!rrx || !rrx.blitzActive) return;
      if (rrx.activePlayerId !== (rrx.blitzOwnerId ?? null)) return;
      rrx.lastAnswerCorrect = false;
      this.goto(roomId, 'score_apply', Date.now() + this.SCORE_APPLY_MS);
      this.timers.set(roomId, 'phase_score_apply', this.SCORE_APPLY_MS, () => this.advanceAfterBlitzScore(roomId));
    });
  }

  private async endBlitz(roomId: string) {
    const rr = this.rooms.get(roomId);
    if (!rr) return;
    rr.blitzActive = false;
    rr.blitzOwnerId = undefined;
    rr.blitzIndex = undefined;
    rr.blitzTotal = undefined;
    rr.blitzBaseValue = undefined;
    rr.blitzCategory = undefined;
    rr.blitzQuestions = undefined;
    rr.questionId = undefined;
    rr.question = undefined;
    rr.questionOptions = undefined;
    rr.isSuperQuestion = undefined;
    rr.activePlayerId = null;
    // After Blitz, the same picker remains
    void this.ensureBoard(roomId).then(() => this.emitBoardState(roomId));
    void this.schedulePrepare(roomId);
  }

  private advanceAfterBlitzScore(roomId: string) {
    const rr = this.rooms.get(roomId);
    if (!rr?.blitzActive) return;
    const next = (rr.blitzIndex ?? 0) + 1;
    if (next < (rr.blitzTotal ?? 0)) {
      rr.blitzIndex = next;
      void this.startBlitzQuestion(roomId);
    } else {
      void this.endBlitz(roomId);
    }
  }

  private async ensureSession(roomId: string) {
    const rr = this.rooms.get(roomId);
    if (!rr) return;
    if (rr.sessionId) return;
    await this.prisma.room.upsert({ where: { id: roomId }, create: { id: roomId }, update: {} });
    let session = await this.prisma.roomSession.findFirst({ where: { roomId, status: 'active' } });
    if (!session) session = await this.prisma.roomSession.create({ data: { roomId } });
    rr.sessionId = session.id;
  }

  // Try to fetch options from assigned SuperQuestion; fallback to generated options
  private async buildSuperOptionsDbFirst(roomId: string, categoryTitle: string, value: number) {
    try {
      const rr = this.rooms.get(roomId);
      const sessionId = rr?.sessionId;
      if (sessionId) {
        const cat = await this.prisma.category.findUnique({ where: { title: categoryTitle } });
        if (cat) {
          const assigned = await this.prisma.roomSuperCell.findFirst({ where: { sessionId, categoryId: cat.id, value } });
          if (assigned) {
            const sq = await this.prisma.superQuestion.findUnique({ where: { id: assigned.superQuestionId } });
            const arr = Array.isArray((sq as any)?.options)
              ? ((sq as any).options as any[]).map((x) => (typeof x === 'string' ? x : String(x?.text ?? ''))).filter(Boolean)
              : [];
            if (arr.length >= 2) return arr.slice(0, 4);
          }
        }
      }
    } catch {}
    return this.buildSuperOptions(categoryTitle, value);
  }

  private async buildSuperOptions(categoryTitle: string, value: number) {
    const correct = await this.loadAnswer(categoryTitle, value);
    const correctNorm = this.normalizeAnswer(correct);
    const candidates = await this.prisma.question.findMany({
      take: 50,
      orderBy: { createdAt: 'asc' },
      select: { canonicalAnswer: true, rawAnswer: true },
    });
    const pool = new Set<string>();
    for (const q of candidates) {
      const a: any = (q as any).canonicalAnswer || (q as any).rawAnswer || '';
      const norm = this.normalizeAnswer(a);
      if (!norm || norm === correctNorm) continue;
      pool.add(String(a));
      if (pool.size >= 30) break;
    }
    const src = Array.from(pool);
    const distractors: string[] = [];
    while (distractors.length < 3 && src.length > 0) {
      const idx = Math.floor(this.rand() * src.length);
      const [pick] = src.splice(idx, 1);
      if (this.normalizeAnswer(pick) !== correctNorm) distractors.push(pick);
    }
    const FALLBACKS = ['—', 'Не знаю', 'Пропуск'];
    for (const f of FALLBACKS) {
      if (distractors.length >= 3) break;
      if (this.normalizeAnswer(f) !== correctNorm) distractors.push(f);
    }
    const arr = [correct, ...distractors.slice(0, 3)];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  setSeed(seed: number) {
    this.rng = this.seededRng(seed);
  }

  private rand() {
    return this.rng();
  }

  private normalizeAnswer(s: string | null | undefined) {
    const t = (s ?? '').toString().toLowerCase();
    return t
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private seededRng(seed: number) {
    let a = seed | 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  private intFromEnv(name: string, fallback: number) {
    const v = process.env[name];
    if (!v) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  private boolFromEnv(name: string, fallback: boolean) {
    const v = process.env[name];
    if (!v) return fallback;
    const s = String(v).toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
    return fallback;
  }
}
