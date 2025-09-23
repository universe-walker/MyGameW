import type { BotEngineService } from '../bot-engine.service';

export async function startBlitz(
  engine: BotEngineService,
  roomId: string,
  ownerId: number,
  categoryTitle: string,
  maxValue: number,
): Promise<void> {
  const runtime = engine.rooms.get(roomId);
  if (!runtime) return;

  runtime.blitzActive = true;
  runtime.blitzOwnerId = ownerId;
  runtime.blitzIndex = 0;
  runtime.blitzTotal = engine.config.blitzCount;
  runtime.blitzBaseValue = maxValue;
  runtime.blitzCategory = categoryTitle;
  runtime.isSuperQuestion = false;
  runtime.questionOptions = undefined;
  runtime.activePlayerId = ownerId;

  runtime.blitzQuestions = await buildBlitzQuestions(engine, roomId, categoryTitle, maxValue, engine.config.blitzCount);
  await startBlitzQuestion(engine, roomId);
}

export async function buildBlitzQuestions(
  engine: BotEngineService,
  roomId: string,
  categoryTitle: string,
  maxValue: number,
  count: number,
) {
  const runtime = engine.rooms.get(roomId);
  const result: { id: string; value: number; prompt: string }[] = [];
  const assignedIds = new Set<string>();
  const round = runtime?.round ?? 1;
  const map = runtime?.cellAssignments?.get(round) ?? new Map<string, string>();
  for (const [key, questionId] of map.entries()) {
    const [cat, valueStr] = key.split(':');
    const value = Number(valueStr);
    if (cat === categoryTitle && Number.isFinite(value) && value <= maxValue && questionId) {
      assignedIds.add(questionId);
    }
  }

  const categoryRecord = await engine.prisma.category.findUnique({ where: { title: categoryTitle } });
  if (!categoryRecord) return result;
  const pool = await engine.prisma.question.findMany({
    where: { categoryId: categoryRecord.id, value: { lte: maxValue } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, value: true, prompt: true },
    take: 100,
  });
  const candidates = pool.filter((question) => !assignedIds.has(question.id));
  const bag = candidates.slice();
  while (result.length < count && bag.length > 0) {
    const index = Math.floor(engine.rand() * bag.length);
    const [pick] = bag.splice(index, 1);
    result.push({ id: pick.id, value: pick.value as number, prompt: pick.prompt as any });
  }
  return result;
}

export async function startBlitzQuestion(engine: BotEngineService, roomId: string): Promise<void> {
  const runtime = engine.rooms.get(roomId);
  if (!runtime || !runtime.blitzActive) return;

  const index = runtime.blitzIndex ?? 0;
  const current = runtime.blitzQuestions?.[index];
  if (!current) {
    await endBlitz(engine, roomId);
    return;
  }

  runtime.question = { category: runtime.blitzCategory || '', value: current.value, prompt: current.prompt };
  runtime.questionId = current.id;
  runtime.activePlayerId = runtime.blitzOwnerId ?? null;

  engine.goto(roomId, 'answer_wait', Date.now() + engine.config.blitzTimerMs);
  void engine.onEnterAnswerWait(roomId);

  engine.timers.set(roomId, 'phase_answer_wait', engine.config.blitzTimerMs, () => {
    const latest = engine.rooms.get(roomId);
    if (!latest || !latest.blitzActive) return;
    if (latest.activePlayerId !== (latest.blitzOwnerId ?? null)) return;
    latest.lastAnswerCorrect = false;
    engine.goto(roomId, 'score_apply', Date.now() + engine.config.scoreApplyMs);
    engine.timers.set(roomId, 'phase_score_apply', engine.config.scoreApplyMs, () => engine.advanceAfterBlitzScore(roomId));
  });
}

export async function endBlitz(engine: BotEngineService, roomId: string): Promise<void> {
  const runtime = engine.rooms.get(roomId);
  if (!runtime) return;

  runtime.blitzActive = false;
  runtime.blitzOwnerId = undefined;
  runtime.blitzIndex = undefined;
  runtime.blitzTotal = undefined;
  runtime.blitzBaseValue = undefined;
  runtime.blitzCategory = undefined;
  runtime.blitzQuestions = undefined;
  runtime.questionId = undefined;
  runtime.question = undefined;
  runtime.questionOptions = undefined;
  runtime.isSuperQuestion = undefined;
  runtime.activePlayerId = null;

  void engine.ensureBoard(roomId).then(() => engine.emitBoardState(roomId));
  void engine.schedulePrepare(roomId);
}

export function advanceAfterBlitzScore(engine: BotEngineService, roomId: string): void {
  const runtime = engine.rooms.get(roomId);
  if (!runtime?.blitzActive) return;
  const next = (runtime.blitzIndex ?? 0) + 1;
  if (next < (runtime.blitzTotal ?? 0)) {
    runtime.blitzIndex = next;
    void startBlitzQuestion(engine, roomId);
  } else {
    void endBlitz(engine, roomId);
  }
}
