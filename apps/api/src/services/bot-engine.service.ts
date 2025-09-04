import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import { TimerRegistryService } from './timer-registry.service';
import { BotProfilesService } from './bot-profiles.service';
import { TelemetryService } from './telemetry.service';
import { PrismaService } from './prisma.service';

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
};

@Injectable()
export class BotEngineService {
  private server: Server | null = null;
  private rooms = new Map<string, RoomRuntime>();
  private botPlayerIds = new Map<string, Map<string, number>>();
  private nextBotId = new Map<string, number>();

  // Config defaults (env overrides)
  private BUZZER_WINDOW_MS = this.intFromEnv('BUZZER_WINDOW_MS', 4500);
  private PREPARE_MS = this.intFromEnv('PREPARE_MS', 1500);
  private ANSWER_WAIT_MS = this.intFromEnv('ANSWER_WAIT_MS', 9000);
  private SCORE_APPLY_MS = this.intFromEnv('SCORE_APPLY_MS', 1000);
  private SOLO_ALLOW_PAUSE = this.boolFromEnv('SOLO_ALLOW_PAUSE', false);

  constructor(
    private timers: TimerRegistryService,
    private profiles: BotProfilesService,
    private telemetry: TelemetryService,
    private prisma: PrismaService,
  ) {}

  setServer(server: Server) {
    this.server = server;
  }

  isRunning(roomId: string) {
    const rr = this.rooms.get(roomId);
    return !!rr?.running;
  }

  start(roomId: string) {
    if (this.isRunning(roomId)) return;
    const now = Date.now();
    const rr: RoomRuntime = { running: true, phase: 'idle', until: undefined, activePlayerId: null };
    this.rooms.set(roomId, rr);
    // Ensure board is loaded and emit to clients
    void this.ensureBoard(roomId).then(() => this.emitBoardState(roomId));
    this.goto(roomId, 'prepare', now + this.PREPARE_MS);
    this.timers.set(roomId, 'phase_prepare', this.PREPARE_MS, () => this.gotoBuzzer(roomId));
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

  onHumanBuzzer(roomId: string, playerId: number) {
    const rr = this.rooms.get(roomId);
    if (!rr || rr.phase !== 'buzzer_window' || rr.activePlayerId) return;
    rr.activePlayerId = playerId;
    this.emitBotStatus(roomId, playerId, 'buzzed');
    // Transition to answer wait immediately
    this.goto(roomId, 'answer_wait', Date.now() + this.ANSWER_WAIT_MS);
    this.timers.set(roomId, 'phase_answer_wait', this.ANSWER_WAIT_MS, () => {
      const rrx = this.rooms.get(roomId);
      // Guard against early human answer changing phase before this fires
      if (!rrx || rrx.phase !== 'answer_wait' || rrx.activePlayerId !== playerId) return;
      // If human did not submit an answer in time, advance automatically
      this.goto(roomId, 'score_apply', Date.now() + this.SCORE_APPLY_MS);
      this.timers.set(roomId, 'phase_score_apply', this.SCORE_APPLY_MS, () => this.cycleNext(roomId));
    });
  }

  onHumanAnswer(roomId: string, playerId: number, _text: string) {
    const rr = this.rooms.get(roomId);
    if (!rr || rr.phase !== 'answer_wait') return;
    // Only the active player can answer
    if (rr.activePlayerId !== playerId) return;
    // For MVP: don't evaluate correctness; proceed to score apply
    this.goto(roomId, 'score_apply', Date.now() + this.SCORE_APPLY_MS);
    this.timers.set(roomId, 'phase_score_apply', this.SCORE_APPLY_MS, () => this.cycleNext(roomId));
  }

  private async gotoBuzzer(roomId: string) {
    const rr = this.rooms.get(roomId);
    if (!rr?.running) return;
    await this.ensureQuestionSelected(roomId);
    const rrx = this.rooms.get(roomId);
    if (!rrx?.running) return;
    rrx.activePlayerId = null;
    this.goto(roomId, 'buzzer_window', Date.now() + this.BUZZER_WINDOW_MS);
    // Schedule bot buzzers
    this.scheduleBotBuzz(roomId);
    // End of window if nobody buzzed
    this.timers.set(roomId, 'phase_buzzer_window', this.BUZZER_WINDOW_MS, () => {
      const rry = this.rooms.get(roomId);
      if (rry && !rry.activePlayerId) {
        // No buzz; clear question and go back to prepare for next pick
        rry.question = undefined;
        this.goto(roomId, 'prepare', Date.now() + this.PREPARE_MS);
        this.timers.set(roomId, 'phase_prepare', this.PREPARE_MS, () => this.gotoBuzzer(roomId));
      }
    });
  }

  private cycleNext(roomId: string) {
    const rr = this.rooms.get(roomId);
    if (!rr?.running) return;
    // Clear control before next round
    rr.activePlayerId = null;
    // Clear current question
    rr.question = undefined;
    // Simple loop back to prepare
    // If board exhausted, reload
    void this.ensureBoard(roomId).then(() => this.emitBoardState(roomId));
    this.goto(roomId, 'prepare', Date.now() + this.PREPARE_MS);
    this.timers.set(roomId, 'phase_prepare', this.PREPARE_MS, () => this.gotoBuzzer(roomId));
  }

  private scheduleBotBuzz(roomId: string) {
    // Load players from redis via attached server rooms metadata (we don't have redis here directly)
    // We will ask connected clients later if needed; for now, assume server exists and we can't read redis.
    // So GameGateway should call start() only when bots are present in players set.
    const bots = this.pickBotsForRoom(roomId);
    const rr = this.rooms.get(roomId);
    if (!rr) return;

    for (const bot of bots) {
      const [min, max] = bot.buzzReactionMs;
      const delay = Math.floor(min + Math.random() * (max - min));
      this.timers.set(roomId, `bot_buzz_${bot.code}`, delay, () => {
        const rrx = this.rooms.get(roomId);
        if (!rrx || rrx.phase !== 'buzzer_window' || rrx.activePlayerId) return;
        // Decide if bot knows enough to buzz (very naive placeholder)
        const pKnow = this.estimateKnow(bot);
        const blind = Math.random() < bot.blindBuzzRate;
        if (blind || Math.random() < pKnow) {
          const playerId = this.getBotPlayerId(roomId, bot.code);
          rrx.activePlayerId = playerId;
          this.emitBotStatus(roomId, playerId, 'buzzed');
          this.telemetry.botBuzz(roomId, playerId);
          // Transition to answer wait
          this.goto(roomId, 'answer_wait', Date.now() + this.ANSWER_WAIT_MS);
          // Schedule bot think and answer
          const thinkMs = this.intFromEnv('BOT_THINK_MS', 900);
          this.emitBotStatus(roomId, playerId, 'thinking');
          this.timers.set(roomId, `bot_answer_${playerId}`, thinkMs, () => {
            const correct = Math.random() < Math.max(0.1, pKnow * (1 - bot.mistakeRate));
            this.emitBotStatus(roomId, playerId, 'answering');
            this.goto(roomId, 'score_apply', Date.now() + this.SCORE_APPLY_MS);
            this.timers.set(roomId, 'phase_score_apply', this.SCORE_APPLY_MS, () => this.cycleNext(roomId));
            this.emitBotStatus(roomId, playerId, correct ? 'correct' : 'wrong');
            this.telemetry.botAnswer(roomId, playerId, correct ? 'correct' : 'wrong');
          });
        }
      });
    }
  }

  private estimateKnow(bot: ReturnType<BotProfilesService['getAll']>[number]) {
    // Placeholder: average knowledge and curve
    const vals = Object.values(bot.knowledgeByTag);
    const base = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0.5;
    return bot.valueCurve === 'steep' ? Math.min(1, base * 1.1) : base;
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
    this.emitPhase(roomId, phase, until);
  }

  private emitPhase(roomId: string, phase: Phase, until?: number) {
    const rr = this.rooms.get(roomId);
    const activePlayerId = rr?.activePlayerId ?? null;
    const question = rr?.question ? { ...rr.question } : undefined;
    this.server?.to(roomId).emit('game:phase', { roomId, phase, until, activePlayerId, question } as any);
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

  private async ensureQuestionSelected(roomId: string) {
    const rr = this.rooms.get(roomId);
    if (!rr) return;
    if (rr.question) return;
    await this.ensureBoard(roomId);
    const cat = rr.board?.find((c) => c.values.length > 0);
    if (!cat) return;
    const value = cat.values.sort((a, b) => a - b)[0];
    // remove from board
    cat.values = cat.values.filter((v) => v !== value);
    this.emitBoardState(roomId);
    // load prompt
    const catRec = await this.prisma.category.findUnique({ where: { title: cat.title } });
    if (catRec) {
      const q = await this.prisma.question.findFirst({
        where: { categoryId: catRec.id, value },
        orderBy: { createdAt: 'asc' },
        select: { prompt: true },
      });
      rr.question = { category: cat.title, value, prompt: q?.prompt || `${cat.title} — ${value}` };
    } else {
      rr.question = { category: cat.title, value, prompt: `${cat.title} — ${value}` };
    }
  }

  async onBoardPick(roomId: string, categoryTitle: string, value: number) {
    const rr = this.rooms.get(roomId);
    if (!rr || !rr.running) return;
    if (rr.phase !== 'prepare') return;
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
    const catRec = await this.prisma.category.findUnique({ where: { title: categoryTitle } });
    if (catRec) {
      const q = await this.prisma.question.findFirst({
        where: { categoryId: catRec.id, value },
        orderBy: { createdAt: 'asc' },
        select: { prompt: true },
      });
      rr.question = { category: categoryTitle, value, prompt: q?.prompt || `${categoryTitle} — ${value}` };
    } else {
      rr.question = { category: categoryTitle, value, prompt: `${categoryTitle} — ${value}` };
    }
    // Move immediately to buzzer window for this question
    // Clear any pending prepare timers to avoid duplicate transitions
    this.timers.clearAll(roomId);
    this.gotoBuzzer(roomId);
  }

  // Public helper to (re)send board state to clients (e.g., on join)
  async publishBoardState(roomId: string) {
    await this.ensureBoard(roomId);
    this.emitBoardState(roomId);
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
