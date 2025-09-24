import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import { TimerRegistryService } from './timer-registry.service';
import { BotProfilesService } from './bot-profiles.service';
import { TelemetryService } from './telemetry.service';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';
import { BotEngineConfig } from './bot-engine/config';
import { seededRng } from './bot-engine/utils';
import { startGame, stopGame, pauseGame, resumeGame, ensureSession } from './bot-engine/lifecycle';
import { gotoPhase, emitPhaseMessage, emitBotStatus, emitBoardState, advanceAfterScore } from './bot-engine/phase';
import {
  onHumanAnswer,
  attemptRevealLetter,
  scheduleBotThinkAndAnswer,
  onEnterAnswerWait,
  scheduleBotBuzz,
} from './bot-engine/answers';
import {
  ensureBoard,
  loadQuestion,
  ensureQuestionSelected,
  onBoardPick as onBoardPickImpl,
  publishBoardState,
  schedulePrepare,
  computePrepareMs,
  ensureOrder,
  getCurrentPickerId,
  getCurrentAnswererId,
  nextIndexInOrder,
  botAutoPick,
  ensureSuperAssignmentsForRound,
  ensureBlitzAssignmentsForRound,
  ensureCellAssignmentsForRound,
  getAssignedQuestionId,
  shouldTriggerBlitz,
  shouldTriggerSuper,
  buildSuperOptionsDbFirst,
  buildSuperOptions,
  loadAnswer,
  loadAnswerById,
} from './bot-engine/board';
import { startBlitz, buildBlitzQuestions, startBlitzQuestion, endBlitz, advanceAfterBlitzScore } from './bot-engine/blitz';
import type { Phase, RoomRuntime, GameMode } from './bot-engine/types';

@Injectable()
export class BotEngineService {
  public server: Server | null = null;
  public readonly rooms = new Map<string, RoomRuntime>();
  public readonly botPlayerIds = new Map<string, Map<string, number>>();
  public readonly nextBotId = new Map<string, number>();
  public readonly config: BotEngineConfig;
  private rng: () => number;

  constructor(
    public readonly timers: TimerRegistryService,
    public readonly profiles: BotProfilesService,
    public readonly telemetry: TelemetryService,
    public readonly prisma: PrismaService,
    public readonly redis: RedisService,
  ) {
    this.config = new BotEngineConfig(process.env);
    const seedEnv = process.env.BOT_RNG_SEED;
    const seed = seedEnv ? Number(seedEnv) : undefined;
    this.rng = typeof seed === 'number' && Number.isFinite(seed) ? seededRng(seed) : Math.random;
  }

  setServer(server: Server) {
    this.server = server;
  }

  isRunning(roomId: string) {
    const runtime = this.rooms.get(roomId);
    return !!runtime?.running;
  }

  start(roomId: string, mode: GameMode = 'solo') {
    startGame(this, roomId, mode);
  }

  stop(roomId: string) {
    stopGame(this, roomId);
  }

  pause(roomId: string) {
    pauseGame(this, roomId);
  }

  resume(roomId: string) {
    resumeGame(this, roomId);
  }

  updateMode(roomId: string, meta: { solo?: boolean; minHumans?: number; autoBots?: number }) {
    const runtime = this.rooms.get(roomId);
    const newMode: GameMode = meta.solo ? 'solo' : 'multi';
    if (runtime) {
      const prev = runtime.mode;
      runtime.mode = newMode;
      if (prev !== newMode) {
        try {
          this.server?.to(roomId).emit('game:modeChanged', { roomId, mode: newMode } as any);
        } catch (e) {
          void e;
        }
      }
    }
  }

  async syncRoster(roomId: string, opts?: { forceRebuild?: boolean }) {
    const runtime = this.rooms.get(roomId);
    if (!runtime) return;
    const players = await this.redis.getPlayers(roomId);
    // Order: humans first then bots, stable by id
    const humans = players.filter((p) => !p.bot).sort((a, b) => a.id - b.id);
    const bots = players.filter((p) => p.bot).sort((a, b) => a.id - b.id);
    const order = [...humans, ...bots].map((p) => p.id);
    const prevOrder = runtime.order ?? [];
    const rosterHash = JSON.stringify(order);
    const changed = opts?.forceRebuild || rosterHash !== runtime.rosterHash || prevOrder.length !== order.length;
    if (!changed) return;

    runtime.order = order;
    runtime.rosterHash = rosterHash;
    // Drop scores for players no longer present; keep existing for those who remain.
    const nextScores: Record<number, number> = {} as any;
    for (const id of order) nextScores[id] = runtime.scores?.[id] ?? 0;
    runtime.scores = nextScores as Record<number, number>;
    // Recompute picker/answer indices if missing or out of range
    const length = order.length;
    if (length > 0) {
      if (typeof runtime.pickerIndex !== 'number' || runtime.pickerIndex >= length) {
        const firstHumanIdx = order.findIndex((id) => id >= 0);
        runtime.pickerIndex = firstHumanIdx >= 0 ? firstHumanIdx : 0;
      }
      if (typeof runtime.answerIndex !== 'number' || runtime.answerIndex >= length) {
        runtime.answerIndex = runtime.pickerIndex ?? 0;
      }
    } else {
      runtime.pickerIndex = 0;
      runtime.answerIndex = 0;
    }

    // Rebuild bot profile mapping
    const botIds = bots.map((b) => b.id);
    const profiles = this.profiles.getAll();
    const mapping = new Map<number, ReturnType<typeof this.profiles.getAll>[number]>();
    let index = 0;
    for (const id of botIds) {
      const profile = profiles[index % Math.max(1, profiles.length)];
      mapping.set(id, profile);
      index += 1;
    }
    runtime.botProfiles = mapping;
  }

  async onHumanAnswer(roomId: string, playerId: number, text: string) {
    await onHumanAnswer(this, roomId, playerId, text);
  }

  async onBoardPick(roomId: string, categoryTitle: string, value: number, pickerId?: number) {
    const runtime = this.rooms.get(roomId);
    if (!runtime?.running) return;
    if (runtime.mode !== 'multi') {
      await onBoardPickImpl(this, roomId, categoryTitle, value, pickerId);
      return;
    }
    // Multi-mode: open buzzer window instead of assigning to picker immediately
    // This mirrors onBoardPick() with mode-specific branch.
    const current = this.rooms.get(roomId);
    if (!current || current.phase !== 'prepare') return;

    if (typeof pickerId === 'number') {
      const currentPickerId = this.getCurrentPickerId(roomId);
      if (currentPickerId == null || currentPickerId !== pickerId) return;
    }

    await this.ensureBoard(roomId);
    const category = current.board?.find((c) => c.title === categoryTitle);
    if (!category) return;
    const valueIndex = category.values.findIndex((v) => v === value);
    if (valueIndex === -1) return;

    category.values.splice(valueIndex, 1);
    this.emitBoardState(roomId);

    current.question = await this.loadQuestion(categoryTitle, value);
    current.questionId = getAssignedQuestionId(this, roomId, categoryTitle, value) ?? undefined;

    current.isSuperQuestion = shouldTriggerSuper(current, categoryTitle, value);
    if (current.isSuperQuestion) {
      try {
        current.questionOptions = await this.buildSuperOptionsDbFirst(roomId, categoryTitle, value);
      } catch {
        current.isSuperQuestion = false;
        current.questionOptions = undefined;
      }
    } else {
      current.questionOptions = undefined;
    }

    this.timers.clearAll(roomId);
    await this.ensureOrder(roomId);
    current.questionStartPickerIndex = current.pickerIndex ?? 0;
    current.answerIndex = current.questionStartPickerIndex;
    current.activePlayerId = null;

    this.goto(roomId, 'buzzer_window', Date.now() + this.config.buzzerWindowMs);
    this.scheduleBotBuzz(roomId);
    this.timers.set(roomId, 'phase_buzzer_window', this.config.buzzerWindowMs, () => {
      const cur = this.rooms.get(roomId);
      if (!cur || cur.phase !== 'buzzer_window') return;
      if (cur.activePlayerId != null) return; // someone buzzed -> handled by their flow
      const cat = cur.question?.category ?? 'unknown';
      const val = cur.question?.value ?? 0;
      void this.loadAnswer(cat, val).then((text) => {
        try {
          this.server?.to(roomId).emit('answer:reveal', { roomId, category: cat, value: val, text } as any);
        } catch (error) {
          void error;
        }
      });
      this.goto(roomId, 'round_end', Date.now() + this.config.revealMs);
      this.timers.set(roomId, 'phase_round_end', this.config.revealMs, () => {
        const nextRuntime = this.rooms.get(roomId);
        if (!nextRuntime?.running) return;
        nextRuntime.question = undefined;
        nextRuntime.questionOptions = undefined;
        nextRuntime.isSuperQuestion = undefined;
        nextRuntime.activePlayerId = null;
        nextRuntime.pickerIndex = this.nextIndexInOrder(roomId, nextRuntime.questionStartPickerIndex ?? 0);
        void this.ensureBoard(roomId).then(() => this.emitBoardState(roomId));
        void this.schedulePrepare(roomId);
      });
    });
  }

  async publishBoardState(roomId: string) {
    await publishBoardState(this, roomId);
  }

  async attemptRevealLetter(roomId: string, playerId: number, position: number) {
    return attemptRevealLetter(this, roomId, playerId, position);
  }

  async onEnterAnswerWait(roomId: string) {
    await onEnterAnswerWait(this, roomId);
  }

  scheduleBotThinkAndAnswer(roomId: string, botPlayerId: number) {
    scheduleBotThinkAndAnswer(this, roomId, botPlayerId);
  }

  scheduleBotBuzz(roomId: string) {
    scheduleBotBuzz(this, roomId);
  }

  onHumanBuzzer(roomId: string, playerId: number) {
    const runtime = this.rooms.get(roomId);
    if (!runtime || !runtime.running) return;
    if (runtime.mode === 'solo') {
      // Keep current behavior: ignore human buzzer; solo flow is controlled by picker/answerIndex
      return;
    }
    // Multiplayer: only accept during buzzer window and when nobody has buzzed yet
    if (runtime.phase !== 'buzzer_window' || runtime.activePlayerId) return;
    runtime.activePlayerId = playerId;
    this.goto(roomId, 'answer_wait', Date.now() + this.config.answerWaitHumanMs);
    this.timers.set(roomId, 'phase_answer_wait', this.config.answerWaitHumanMs, () => {
      const latest = this.rooms.get(roomId);
      if (!latest || latest.phase !== 'answer_wait' || latest.activePlayerId !== playerId) return;
      latest.lastAnswerCorrect = false;
      this.goto(roomId, 'score_apply', Date.now() + this.config.scoreApplyMs);
      this.timers.set(roomId, 'phase_score_apply', this.config.scoreApplyMs, () => this.advanceAfterScore(roomId));
    });
  }

  goto(roomId: string, phase: Phase, until?: number) {
    gotoPhase(this, roomId, phase, until);
  }

  emitPhase(roomId: string, phase: Phase, until?: number) {
    emitPhaseMessage(this, roomId, phase, until);
  }

  emitBotStatus(
    roomId: string,
    playerId: number,
    status: 'idle' | 'thinking' | 'buzzed' | 'answering' | 'passed' | 'wrong' | 'correct',
  ) {
    emitBotStatus(this, roomId, playerId, status);
  }

  emitBoardState(roomId: string) {
    emitBoardState(this, roomId);
  }

  advanceAfterScore(roomId: string) {
    advanceAfterScore(this, roomId);
  }

  advanceAfterBlitzScore(roomId: string) {
    advanceAfterBlitzScore(this, roomId);
  }

  async ensureBoard(roomId: string) {
    await ensureBoard(this, roomId);
  }

  async loadQuestion(categoryTitle: string, value: number) {
    return loadQuestion(this, categoryTitle, value);
  }

  async ensureQuestionSelected(roomId: string) {
    await ensureQuestionSelected(this, roomId);
  }

  async schedulePrepare(roomId: string) {
    await schedulePrepare(this, roomId);
  }

  async computePrepareMs(roomId: string) {
    return computePrepareMs(this, roomId);
  }

  async ensureOrder(roomId: string) {
    await ensureOrder(this, roomId);
  }

  getCurrentPickerId(roomId: string) {
    return getCurrentPickerId(this, roomId);
  }

  getCurrentAnswererId(roomId: string) {
    return getCurrentAnswererId(this, roomId);
  }

  nextIndexInOrder(roomId: string, index: number) {
    return nextIndexInOrder(this, roomId, index);
  }

  async botAutoPick(roomId: string) {
    await botAutoPick(this, roomId);
  }

  async ensureSuperAssignmentsForRound(roomId: string) {
    await ensureSuperAssignmentsForRound(this, roomId);
  }

  async ensureBlitzAssignmentsForRound(roomId: string) {
    await ensureBlitzAssignmentsForRound(this, roomId);
  }

  async ensureCellAssignmentsForRound(roomId: string) {
    await ensureCellAssignmentsForRound(this, roomId);
  }

  getAssignedQuestionId(roomId: string, categoryTitle: string, value: number) {
    return getAssignedQuestionId(this, roomId, categoryTitle, value);
  }

  shouldTriggerBlitz(runtime: RoomRuntime | undefined, categoryTitle: string, value: number) {
    return shouldTriggerBlitz(this, runtime, categoryTitle, value);
  }

  shouldTriggerSuper(runtime: RoomRuntime | undefined, categoryTitle: string, value: number) {
    return shouldTriggerSuper(runtime, categoryTitle, value);
  }

  async buildSuperOptionsDbFirst(roomId: string, categoryTitle: string, value: number) {
    return buildSuperOptionsDbFirst(this, roomId, categoryTitle, value);
  }

  async buildSuperOptions(categoryTitle: string, value: number) {
    return buildSuperOptions(this, categoryTitle, value);
  }

  async loadAnswer(categoryTitle: string, value: number) {
    return loadAnswer(this, categoryTitle, value);
  }

  async loadAnswerById(questionId: string) {
    return loadAnswerById(this, questionId);
  }

  async startBlitz(roomId: string, ownerId: number, categoryTitle: string, maxValue: number) {
    await startBlitz(this, roomId, ownerId, categoryTitle, maxValue);
  }

  async startBlitzQuestion(roomId: string) {
    await startBlitzQuestion(this, roomId);
  }

  async endBlitz(roomId: string) {
    await endBlitz(this, roomId);
  }

  async buildBlitzQuestions(roomId: string, categoryTitle: string, maxValue: number, count: number) {
    return buildBlitzQuestions(this, roomId, categoryTitle, maxValue, count);
  }

  async ensureSession(roomId: string) {
    await ensureSession(this, roomId);
  }

  setSeed(seed: number) {
    this.rng = seededRng(seed);
  }

  rand() {
    return this.rng();
  }
}

export { Phase };
