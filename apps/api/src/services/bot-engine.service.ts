import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import { TimerRegistryService } from './timer-registry.service';
import { BotProfilesService } from './bot-profiles.service';
import { TelemetryService } from './telemetry.service';

export type Phase = 'idle' | 'prepare' | 'buzzer_window' | 'answer_wait' | 'score_apply' | 'round_end' | 'final';

type RoomRuntime = {
  running: boolean;
  phase: Phase;
  until?: number;
  activePlayerId?: number | null;
};

@Injectable()
export class BotEngineService {
  private server: Server | null = null;
  private rooms = new Map<string, RoomRuntime>();

  // Config defaults (env overrides)
  private BUZZER_WINDOW_MS = this.intFromEnv('BUZZER_WINDOW_MS', 3000);
  private PREPARE_MS = this.intFromEnv('PREPARE_MS', 1500);
  private ANSWER_WAIT_MS = this.intFromEnv('ANSWER_WAIT_MS', 2500);
  private SCORE_APPLY_MS = this.intFromEnv('SCORE_APPLY_MS', 1000);
  private SOLO_ALLOW_PAUSE = this.boolFromEnv('SOLO_ALLOW_PAUSE', true);

  constructor(
    private timers: TimerRegistryService,
    private profiles: BotProfilesService,
    private telemetry: TelemetryService,
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
    this.goto(roomId, 'prepare', now + this.PREPARE_MS);
    this.timers.set(roomId, 'phase_prepare', this.PREPARE_MS, () => this.gotoBuzzer(roomId));
    this.telemetry.soloStarted(roomId);
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
    this.timers.set(roomId, 'phase_answer_wait', this.ANSWER_WAIT_MS, () => this.goto(roomId, 'score_apply', Date.now() + this.SCORE_APPLY_MS));
  }

  onHumanAnswer(roomId: string, _playerId: number, _text: string) {
    const rr = this.rooms.get(roomId);
    if (!rr || rr.phase !== 'answer_wait') return;
    // For MVP: don't evaluate correctness; proceed to score apply
    this.goto(roomId, 'score_apply', Date.now() + this.SCORE_APPLY_MS);
    this.timers.set(roomId, 'phase_score_apply', this.SCORE_APPLY_MS, () => this.cycleNext(roomId));
  }

  private gotoBuzzer(roomId: string) {
    const rr = this.rooms.get(roomId);
    if (!rr?.running) return;
    rr.activePlayerId = null;
    this.goto(roomId, 'buzzer_window', Date.now() + this.BUZZER_WINDOW_MS);
    // Schedule bot buzzers
    this.scheduleBotBuzz(roomId);
    // End of window if nobody buzzed
    this.timers.set(roomId, 'phase_buzzer_window', this.BUZZER_WINDOW_MS, () => {
      if (!this.rooms.get(roomId)?.activePlayerId) {
        // No buzz; cycle again
        this.goto(roomId, 'prepare', Date.now() + this.PREPARE_MS);
        this.timers.set(roomId, 'phase_prepare', this.PREPARE_MS, () => this.gotoBuzzer(roomId));
      }
    });
  }

  private cycleNext(roomId: string) {
    const rr = this.rooms.get(roomId);
    if (!rr?.running) return;
    // Simple loop back to prepare
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
          const playerId = this.findBotPlayerId(roomId, bot.code);
          if (!playerId) return;
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

  private findBotPlayerId(roomId: string, _botCode: string): number | null {
    // For MVP, negative IDs are bots; pick -1 by convention.
    // Gateway adds bots with -1, -2, ...
    return -1;
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
    this.server?.to(roomId).emit('game:phase', { roomId, phase, until } as any);
  }

  private emitBotStatus(roomId: string, playerId: number, status: 'idle' | 'thinking' | 'buzzed' | 'answering' | 'passed' | 'wrong' | 'correct') {
    this.server?.to(roomId).emit('bot:status', { roomId, playerId, status, at: Date.now() } as any);
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
