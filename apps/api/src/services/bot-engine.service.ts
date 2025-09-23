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
  onBoardPick,
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
import type { Phase, RoomRuntime } from './bot-engine/types';

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

  start(roomId: string) {
    startGame(this, roomId);
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

  async onHumanAnswer(roomId: string, playerId: number, text: string) {
    await onHumanAnswer(this, roomId, playerId, text);
  }

  async onBoardPick(roomId: string, categoryTitle: string, value: number, pickerId?: number) {
    await onBoardPick(this, roomId, categoryTitle, value, pickerId);
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
