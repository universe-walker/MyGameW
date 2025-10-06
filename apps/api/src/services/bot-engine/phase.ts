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

  // On final phase in multiplayer, persist profile scores into rating
  if (phase === 'final') {
    try {
      // Fire-and-forget; safe guard against duplicate application
      void applyMultiplayerRating(engine, roomId);
    } catch (e) {
      void e;
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
    runtime.questionId = undefined;
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
    const qid = runtime.questionId;
    const loader = qid ? engine.loadAnswerById(qid) : engine.loadAnswer(category, value);
    Promise.resolve(loader).then((text) => {
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
      nextRuntime.questionId = undefined;
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
    // If the picker just failed in multi mode, open a buzzer window for others
    if ((runtime.mode === 'multi') && (currentAnswerIdx === startIdx)) {
      runtime.activePlayerId = null;
      engine.goto(roomId, 'buzzer_window', Date.now() + engine.config.buzzerWindowMs);
      engine.scheduleBotBuzz(roomId);
      engine.timers.set(roomId, 'phase_buzzer_window', engine.config.buzzerWindowMs, () => {
        const cur = engine.rooms.get(roomId);
        if (!cur || cur.phase !== 'buzzer_window') return;
        if (cur.activePlayerId != null) return; // somebody buzzed -> handled by their flow
        const cat = cur.question?.category ?? 'unknown';
        const val = cur.question?.value ?? 0;
        void engine.loadAnswer(cat, val).then((text) => {
          try {
            engine.server?.to(roomId).emit('answer:reveal', { roomId, category: cat, value: val, text } as any);
          } catch (error) {
            void error;
          }
        });
        engine.goto(roomId, 'round_end', Date.now() + engine.config.revealMs);
        engine.timers.set(roomId, 'phase_round_end', engine.config.revealMs, () => {
          const nextRuntime = engine.rooms.get(roomId);
          if (!nextRuntime?.running) return;
          nextRuntime.question = undefined;
          nextRuntime.questionId = undefined;
          nextRuntime.questionOptions = undefined;
          nextRuntime.isSuperQuestion = undefined;
          nextRuntime.activePlayerId = null;
          nextRuntime.pickerIndex = engine.nextIndexInOrder(roomId, startIdx);
          void engine.ensureBoard(roomId).then(() => engine.emitBoardState(roomId));
          void engine.schedulePrepare(roomId);
        });
      });
      return;
    }

    // Otherwise continue to the next answerer sequentially
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
    const qid = runtime.questionId;
    const loader = qid ? engine.loadAnswerById(qid) : engine.loadAnswer(category, value);
    Promise.resolve(loader).then((text) => {
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
    nextRuntime.questionId = undefined;
    nextRuntime.questionOptions = undefined;
    nextRuntime.isSuperQuestion = undefined;
    nextRuntime.activePlayerId = null;
    nextRuntime.pickerIndex = engine.nextIndexInOrder(roomId, startIdx);
    void engine.ensureBoard(roomId).then(() => engine.emitBoardState(roomId));
    void engine.schedulePrepare(roomId);
  });
}

async function applyMultiplayerRating(engine: BotEngineService, roomId: string): Promise<void> {
  const runtime = engine.rooms.get(roomId);
  if (!runtime) return;
  if (runtime.ratingApplied) return;
  // Only for multiplayer matches
  if (runtime.mode !== 'multi') return;

  runtime.ratingApplied = true;

  // Collect human player ids from current roster and from score map (in case someone left)
  let humanIds: number[] = [];
  try {
    const players = await engine.redis.getPlayers(roomId);
    humanIds = players.filter((p) => !p.bot && typeof p.id === 'number' && p.id > 0).map((p) => p.id);
  } catch {
    // ignore redis failures; fall back to scores keys
  }
  const scoreKeys = Object.keys(runtime.scores || {})
    .map((k) => Number(k))
    .filter((id) => Number.isFinite(id) && id > 0);
  const idSet = new Set<number>([...humanIds, ...scoreKeys]);
  const ids = Array.from(idSet.values());
  if (ids.length === 0) return;

  // Build score map for those ids; default 0
  const scores: Record<number, number> = {};
  for (const id of ids) scores[id] = runtime.scores?.[id] ?? 0;

  // Determine winners among humans: highest strictly positive score
  const maxScore = ids.reduce((m, id) => (scores[id] > m ? scores[id] : m), 0);
  const winners = maxScore > 0 ? new Set(ids.filter((id) => scores[id] === maxScore)) : new Set<number>();

  // Prepare Prisma ops: ensure User existence, then apply profileScore with clamp to >= 0
  const userEnsures = ids.map((id) =>
    engine.prisma.user.upsert({
      where: { id: BigInt(id) },
      update: {},
      create: { id: BigInt(id), firstName: 'User', username: null },
    }),
  );
  try {
    await engine.prisma.$transaction(userEnsures);
  } catch {
    // best-effort; continue
  }

  // Read current metas
  const metas = await engine.prisma.userMeta.findMany({ where: { userId: { in: ids.map((n) => BigInt(n)) } } });
  const metaById = new Map<number, { userId: bigint; profileScore: number; hintAllowance: number | null }>();
  for (const m of metas as any[]) metaById.set(Number(m.userId), { userId: m.userId, profileScore: Number(m.profileScore ?? 0), hintAllowance: Number(m.hintAllowance ?? 0) });

  const ops: any[] = [];
  for (const id of ids) {
    const base = scores[id] ?? 0;
    const delta = winners.has(id) && base > 0 ? base * 2 : base;
    const current = metaById.get(id)?.profileScore ?? 0;
    let next = current;
    if (delta > 0) next = current + delta;
    else if (delta < 0) next = Math.max(0, current + delta);

    if (metaById.has(id)) {
      ops.push(
        engine.prisma.userMeta.update({ where: { userId: BigInt(id) }, data: { profileScore: next } }),
      );
    } else {
      ops.push(
        engine.prisma.userMeta.create({
          data: { userId: BigInt(id), profileScore: next, hintAllowance: 0, achievements: undefined },
        }),
      );
    }
  }

  try {
    if (ops.length) await engine.prisma.$transaction(ops);
  } catch (e) {
    void e;
  }
}
