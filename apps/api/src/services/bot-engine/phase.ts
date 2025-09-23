import type { BotEngineService } from '../bot-engine.service';
import type { Phase } from './types';

export function gotoPhase(engine: BotEngineService, roomId: string, phase: Phase, until?: number): void {
  const runtime = engine.rooms.get(roomId);
  if (!runtime) return;

  runtime.phase = phase;
  runtime.until = until;

  if (phase === 'score_apply') {
    const playerId = runtime.activePlayerId;
    const value = runtime.question?.value ?? 0;
    if (playerId != null && typeof value === 'number' && value > 0) {
      runtime.scores = runtime.scores || {};
      if (typeof runtime.lastAnswerCorrect === 'boolean') {
        let delta = 0;
        if (runtime.blitzActive) {
          const base = runtime.blitzBaseValue ?? value;
          if (engine.config.blitzScoringMode === 'fixed') {
            delta = runtime.lastAnswerCorrect
              ? engine.config.blitzFixedCorrect
              : Math.round(engine.config.blitzFixedCorrect * engine.config.blitzWrongFactor);
          } else {
            delta = runtime.lastAnswerCorrect
              ? Math.round(base * engine.config.blitzCorrectFactor)
              : Math.round(base * engine.config.blitzWrongFactor);
          }
        } else {
          const roundFactor = (runtime.round ?? 1) >= 2 ? 2 : 1;
          if (runtime.lastAnswerCorrect) {
            delta = value * roundFactor;
          } else {
            delta = runtime.isSuperQuestion ? -Math.round((value * roundFactor) / 2) : -(value * roundFactor);
          }
        }
        runtime.scores[playerId] = (runtime.scores[playerId] ?? 0) + delta;
      }
    }
  }

  emitPhaseMessage(engine, roomId, phase, until);
}

export function emitPhaseMessage(engine: BotEngineService, roomId: string, phase: Phase, until?: number): void {
  const runtime = engine.rooms.get(roomId);
  if (!runtime) return;

  const activePlayerId = runtime.activePlayerId ?? null;
  const question = runtime.question
    ? {
        ...runtime.question,
        ...(Array.isArray(runtime.questionOptions) ? { options: runtime.questionOptions } : {}),
      }
    : undefined;
  const scores = runtime.scores ? { ...runtime.scores } : undefined;
  const mode = runtime.blitzActive ? 'blitz' : 'normal';
  const blitz = runtime.blitzActive
    ? {
        index: (runtime.blitzIndex ?? 0) + 1,
        total: runtime.blitzTotal ?? 0,
        ownerPlayerId: runtime.blitzOwnerId ?? 0,
        timerMs: engine.config.blitzTimerMs,
      }
    : undefined;

  try {
    engine.server?.to(roomId).emit(
      'game:phase',
      { roomId, phase, until, activePlayerId, question, scores, mode, blitz } as any,
    );
  } catch (error) {
    // Ignore transport errors; clients will resync on next tick.
    void error;
  }
}

export function emitBotStatus(
  engine: BotEngineService,
  roomId: string,
  playerId: number,
  status: 'idle' | 'thinking' | 'buzzed' | 'answering' | 'passed' | 'wrong' | 'correct',
): void {
  try {
    engine.server?.to(roomId).emit('bot:status', { roomId, playerId, status, at: Date.now() } as any);
  } catch (error) {
    void error;
  }
}

export function emitBoardState(engine: BotEngineService, roomId: string): void {
  const runtime = engine.rooms.get(roomId);
  if (!runtime) return;

  const round = runtime.round ?? 1;
  const blitzSet = runtime.blitzCells?.get(round) ?? new Set<string>();
  const categories = (runtime.board ?? []).map((category) => {
    const blitzValues = category.values.filter((value) => blitzSet.has(`${category.title}:${value}`));
    return blitzValues.length ? { ...category, blitzValues } : { ...category };
  });

  try {
    engine.server?.to(roomId).emit('board:state', { roomId, round, categories } as any);
  } catch (error) {
    void error;
  }
}

export function advanceAfterScore(engine: BotEngineService, roomId: string): void {
  const runtime = engine.rooms.get(roomId);
  if (!runtime?.running) return;

  const orderLength = runtime.order?.length ?? 0;
  if (!orderLength) return;

  const wasCorrect = runtime.lastAnswerCorrect === true;
  const currentAnswerIdx = runtime.answerIndex ?? runtime.pickerIndex ?? 0;
  const startIdx = runtime.questionStartPickerIndex ?? runtime.pickerIndex ?? 0;

  runtime.lastAnswerCorrect = undefined;

  if (wasCorrect) {
    runtime.pickerIndex = currentAnswerIdx;
    runtime.question = undefined;
    runtime.questionOptions = undefined;
    runtime.isSuperQuestion = undefined;
    runtime.activePlayerId = null;
    void engine.ensureBoard(roomId).then(() => engine.emitBoardState(roomId));
    void engine.schedulePrepare(roomId);
    return;
  }

  if (runtime.isSuperQuestion) {
    const category = runtime.question?.category ?? 'unknown';
    const value = runtime.question?.value ?? 0;
    void engine.loadAnswer(category, value).then((text) => {
      try {
        engine.server?.to(roomId).emit('answer:reveal', { roomId, category, value, text } as any);
      } catch (error) {
        void error;
      }
    });

    engine.goto(roomId, 'round_end', Date.now() + engine.config.revealMs);
    engine.timers.set(roomId, 'phase_round_end', engine.config.revealMs, () => {
      const nextRuntime = engine.rooms.get(roomId);
      if (!nextRuntime?.running) return;
      nextRuntime.question = undefined;
      nextRuntime.questionOptions = undefined;
      nextRuntime.isSuperQuestion = undefined;
      nextRuntime.activePlayerId = null;
      nextRuntime.pickerIndex = engine.nextIndexInOrder(roomId, startIdx);
      void engine.ensureBoard(roomId).then(() => engine.emitBoardState(roomId));
      void engine.schedulePrepare(roomId);
    });
    return;
  }

  if (currentAnswerIdx < orderLength - 1) {
    runtime.answerIndex = currentAnswerIdx + 1;
    const nextId = engine.getCurrentAnswererId(roomId);
    runtime.activePlayerId = nextId ?? null;
    const isBot = typeof nextId === 'number' ? nextId < 0 : false;
    const waitMs = isBot ? engine.config.answerWaitBotMs : engine.config.answerWaitHumanMs;

    engine.goto(roomId, 'answer_wait', Date.now() + waitMs);
    void engine.onEnterAnswerWait(roomId);

    if (isBot && typeof nextId === 'number') {
      engine.scheduleBotThinkAndAnswer(roomId, nextId);
    } else {
      engine.timers.set(roomId, 'phase_answer_wait', waitMs, () => {
        const waitRuntime = engine.rooms.get(roomId);
        if (!waitRuntime || waitRuntime.phase !== 'answer_wait' || waitRuntime.activePlayerId !== nextId) return;
        waitRuntime.lastAnswerCorrect = false;
        engine.goto(roomId, 'score_apply', Date.now() + engine.config.scoreApplyMs);
        engine.timers.set(roomId, 'phase_score_apply', engine.config.scoreApplyMs, () => engine.advanceAfterScore(roomId));
      });
    }
    return;
  }

  const category = runtime.question?.category ?? 'unknown';
  const value = runtime.question?.value ?? 0;
  void engine.loadAnswer(category, value).then((text) => {
    try {
      engine.server?.to(roomId).emit('answer:reveal', { roomId, category, value, text } as any);
    } catch (error) {
      void error;
    }
  });

  engine.goto(roomId, 'round_end', Date.now() + engine.config.revealMs);
  engine.timers.set(roomId, 'phase_round_end', engine.config.revealMs, () => {
    const nextRuntime = engine.rooms.get(roomId);
    if (!nextRuntime?.running) return;
    nextRuntime.question = undefined;
    nextRuntime.questionOptions = undefined;
    nextRuntime.isSuperQuestion = undefined;
    nextRuntime.activePlayerId = null;
    nextRuntime.pickerIndex = engine.nextIndexInOrder(roomId, startIdx);
    void engine.ensureBoard(roomId).then(() => engine.emitBoardState(roomId));
    void engine.schedulePrepare(roomId);
  });
}
