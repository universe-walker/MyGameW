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
  // Super-game options for current question (if any)
  questionOptions?: string[];
  // Flag: current question is Super-game
  isSuperQuestion?: boolean;
  // Scoreboard for the room (playerId -> score)
  scores?: Record<number, number>;
  // Whether the last submitted answer (by activePlayerId) was correct
  lastAnswerCorrect?: boolean;
  // Turn order and picking/answering state
  order?: number[];
  pickerIndex?: number; // index in order[] of who selects the question
  answerIndex?: number; // index in order[] of who currently answers
  questionStartPickerIndex?: number; // index in order[] who picked current question
  botProfiles?: Map<number, ReturnType<BotProfilesService['getAll']>[number]>; // mapping botId -> profile
  // Rounds and Super usage tracking
  round?: number; // 1-based
  superUsed?: Map<number, Set<number>>; // round -> used values (e.g., 200, 400)
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
      superUsed: new Map(),
    };
    this.rooms.set(roomId, rr);
    // Ensure board is loaded and emit to clients
    void this.ensureBoard(roomId).then(() => this.emitBoardState(roomId));
    // Dynamic prepare window depending on whether humans are present
    void this.schedulePrepare(roomId);
    this.telemetry.soloStarted(roomId);
  }

  stop(roomId: string) {
    const rr = this.rooms.get(roomId);
    if (!rr) return;
    rr.running = false;
    this.timers.clearAll(roomId);
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
      if (q?.category && typeof q.value === 'number') {
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
      // Fallback: treat non-empty as correct when DB lookup fails
      correct = typeof text === 'string' && text.trim().length > 0;
    }
    rr.lastAnswerCorrect = correct;
    this.goto(roomId, 'score_apply', Date.now() + this.SCORE_APPLY_MS);
    this.timers.set(roomId, 'phase_score_apply', this.SCORE_APPLY_MS, () => this.advanceAfterScore(roomId));
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
          if (rr.lastAnswerCorrect) {
            delta = val;
          } else {
            delta = rr.isSuperQuestion ? -Math.round(val / 2) : -val;
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
    this.server?.to(roomId).emit('game:phase', { roomId, phase, until, activePlayerId, question, scores } as any);
  }

  private emitBotStatus(roomId: string, playerId: number, status: 'idle' | 'thinking' | 'buzzed' | 'answering' | 'passed' | 'wrong' | 'correct') {
    this.server?.to(roomId).emit('bot:status', { roomId, playerId, status, at: Date.now() } as any);
  }

  private emitBoardState(roomId: string) {
    const rr = this.rooms.get(roomId);
    const categories = rr?.board ?? [];
    this.server?.to(roomId).emit('board:state', { roomId, categories } as any);
  }

  private async ensureBoard(roomId: string) {
    const rr = this.rooms.get(roomId);
    if (!rr) return;
    if (rr.board && rr.board.some((c) => c.values.length > 0)) return;
    // If board existed but is now empty, advance round and reset Super usage for that round
    if (rr.board && rr.board.every((c) => c.values.length === 0)) {
      rr.round = (rr.round ?? 1) + 1;
      rr.superUsed = rr.superUsed ?? new Map();
      if (!rr.superUsed.has(rr.round)) rr.superUsed.set(rr.round, new Set());
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
    // Super-game decision and options
    rr.isSuperQuestion = this.shouldTriggerSuper(rr, value);
    if (rr.isSuperQuestion) {
      try {
        rr.questionOptions = await this.buildSuperOptions(categoryTitle, value);
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

  private shouldTriggerSuper(rr: RoomRuntime, value: number) {
    const round = rr.round ?? 1;
    const allowed = round === 1 ? new Set([400]) : round === 2 ? new Set([200, 400]) : new Set<number>();
    if (!allowed.has(value)) return false;
    rr.superUsed = rr.superUsed ?? new Map();
    if (!rr.superUsed.has(round)) rr.superUsed.set(round, new Set());
    const used = rr.superUsed.get(round)!;
    if (used.has(value)) return false;
    used.add(value);
    return true;
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
