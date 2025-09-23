import type { BotEngineService } from '../bot-engine.service';
import type { RoomRuntime } from './types';
import { ensureSession } from './lifecycle';
import { normalizeAnswer } from './utils';

export async function ensureBoard(engine: BotEngineService, roomId: string): Promise<void> {
  const runtime = engine.rooms.get(roomId);
  if (!runtime) return;
  if (runtime.board && runtime.board.some((c) => c.values.length > 0)) return;

  if (runtime.board && runtime.board.every((c) => c.values.length === 0)) {
    runtime.round = (runtime.round ?? 1) + 1;
    if ((runtime.round ?? 1) > 2) {
      runtime.activePlayerId = null;
      engine.timers.clearAll(roomId);
      engine.goto(roomId, 'final');
      return;
    }
  }

  const categories = await engine.prisma.category.findMany({
    take: 4,
    orderBy: { createdAt: 'asc' },
    include: { questions: { select: { value: true }, orderBy: { value: 'asc' }, take: 5 } },
  });

  runtime.board = categories.map((category) => ({
    title: category.title,
    values: Array.from(new Set(category.questions.map((q) => q.value)))
      .sort((a, b) => a - b)
      .slice(0, 5),
  }));

  await ensureSuperAssignmentsForRound(engine, roomId);
  await ensureBlitzAssignmentsForRound(engine, roomId);
  await ensureCellAssignmentsForRound(engine, roomId);
}

export async function loadQuestion(engine: BotEngineService, categoryTitle: string, value: number) {
  const categoryRecord = await engine.prisma.category.findUnique({ where: { title: categoryTitle } });
  if (categoryRecord) {
    const question = await engine.prisma.question.findFirst({
      where: { categoryId: categoryRecord.id, value },
      orderBy: { createdAt: 'asc' },
      select: { prompt: true },
    });
    return { category: categoryTitle, value, prompt: question?.prompt || `${categoryTitle} Ч ${value}` };
  }
  return { category: categoryTitle, value, prompt: `${categoryTitle} Ч ${value}` };
}

export async function ensureQuestionSelected(engine: BotEngineService, roomId: string): Promise<void> {
  const runtime = engine.rooms.get(roomId);
  if (!runtime) return;
  if (runtime.question) return;

  await ensureBoard(engine, roomId);
  const candidates = (runtime.board ?? []).filter((category) => category.values.length > 0);
  if (!candidates.length) return;

  const category = candidates[Math.floor(engine.rand() * candidates.length)];
  const valueIndex = Math.floor(engine.rand() * category.values.length);
  const value = category.values[valueIndex];

  category.values = category.values.filter((_, index) => index !== valueIndex);
  engine.emitBoardState(roomId);
  runtime.question = await loadQuestion(engine, category.title, value);
}

export async function onBoardPick(
  engine: BotEngineService,
  roomId: string,
  categoryTitle: string,
  value: number,
  pickerId?: number,
): Promise<void> {
  const runtime = engine.rooms.get(roomId);
  if (!runtime?.running) return;
  if (runtime.phase !== 'prepare') return;

  if (typeof pickerId === 'number') {
    const currentPickerId = getCurrentPickerId(engine, roomId);
    if (currentPickerId == null || currentPickerId !== pickerId) return;
  }

  await ensureBoard(engine, roomId);
  const category = runtime.board?.find((c) => c.title === categoryTitle);
  if (!category) return;
  const valueIndex = category.values.findIndex((v) => v === value);
  if (valueIndex === -1) return;

  category.values.splice(valueIndex, 1);
  engine.emitBoardState(roomId);

  runtime.question = await loadQuestion(engine, categoryTitle, value);
  runtime.questionId = getAssignedQuestionId(engine, roomId, categoryTitle, value) ?? undefined;

  if (shouldTriggerBlitz(engine, runtime, categoryTitle, value)) {
    await engine.startBlitz(roomId, pickerId ?? getCurrentPickerId(engine, roomId) ?? 0, categoryTitle, value);
    return;
  }

  runtime.isSuperQuestion = shouldTriggerSuper(runtime, categoryTitle, value);
  if (runtime.isSuperQuestion) {
    try {
      runtime.questionOptions = await buildSuperOptionsDbFirst(engine, roomId, categoryTitle, value);
    } catch {
      runtime.isSuperQuestion = false;
      runtime.questionOptions = undefined;
    }
  } else {
    runtime.questionOptions = undefined;
  }

  engine.timers.clearAll(roomId);
  await ensureOrder(engine, roomId);
  runtime.questionStartPickerIndex = runtime.pickerIndex ?? 0;
  runtime.answerIndex = runtime.questionStartPickerIndex;
  const answererId = getCurrentAnswererId(engine, roomId);
  runtime.activePlayerId = answererId ?? null;
  const isBot = typeof answererId === 'number' ? answererId < 0 : false;
  const waitMs = runtime.isSuperQuestion
    ? engine.config.superWaitMs
    : isBot
    ? engine.config.answerWaitBotMs
    : engine.config.answerWaitHumanMs;

  engine.goto(roomId, 'answer_wait', Date.now() + waitMs);
  void engine.onEnterAnswerWait(roomId);

  if (isBot && typeof answererId === 'number') {
    engine.scheduleBotThinkAndAnswer(roomId, answererId);
  } else {
    engine.timers.set(roomId, 'phase_answer_wait', waitMs, () => {
      const current = engine.rooms.get(roomId);
      if (!current || current.phase !== 'answer_wait' || current.activePlayerId !== answererId) return;
      current.lastAnswerCorrect = false;
      engine.goto(roomId, 'score_apply', Date.now() + engine.config.scoreApplyMs);
      engine.timers.set(roomId, 'phase_score_apply', engine.config.scoreApplyMs, () => engine.advanceAfterScore(roomId));
    });
  }
}

export async function publishBoardState(engine: BotEngineService, roomId: string): Promise<void> {
  await ensureBoard(engine, roomId);
  engine.emitBoardState(roomId);
}

export async function schedulePrepare(engine: BotEngineService, roomId: string): Promise<void> {
  await ensureOrder(engine, roomId);
  const runtime = engine.rooms.get(roomId);
  if (!runtime) return;
  if (runtime.phase === 'final') return;

  const pickerId = getCurrentPickerId(engine, roomId);
  runtime.activePlayerId = pickerId ?? null;
  const ms = await computePrepareMs(engine, roomId);
  engine.goto(roomId, 'prepare', Date.now() + ms);

  const isBot = typeof pickerId === 'number' ? pickerId < 0 : false;
  if (isBot) {
    engine.timers.set(roomId, 'phase_prepare', ms, () => {
      botAutoPick(engine, roomId);
    });
  } else {
    engine.timers.set(roomId, 'phase_prepare', ms, () => {
      const current = engine.rooms.get(roomId);
      if (!current?.running) return;
      current.pickerIndex = nextIndexInOrder(engine, roomId, current.pickerIndex ?? 0);
      void schedulePrepare(engine, roomId);
    });
  }
}

export async function computePrepareMs(engine: BotEngineService, roomId: string): Promise<number> {
  const pickerId = getCurrentPickerId(engine, roomId);
  const isBot = typeof pickerId === 'number' ? pickerId < 0 : false;
  if (!isBot) return engine.config.getInt('PREPARE_HUMAN_MS', 12000);
  const min = engine.config.getInt('PREPARE_BOT_MIN_MS', 4000);
  const max = engine.config.getInt('PREPARE_BOT_MAX_MS', 6000);
  const span = Math.max(0, max - min);
  return min + Math.floor(engine.rand() * (span || 1));
}

export async function ensureOrder(engine: BotEngineService, roomId: string): Promise<void> {
  const runtime = engine.rooms.get(roomId);
  if (!runtime) return;
  if (runtime.order && typeof runtime.pickerIndex === 'number') return;

  const players = await engine.redis.getPlayers(roomId);
  const humans = players.filter((p) => !p.bot);
  const bots = players.filter((p) => p.bot);
  const order = [...humans, ...bots].map((p) => p.id);
  runtime.order = order;

  const firstHumanIdx = order.findIndex((id) => id >= 0);
  runtime.pickerIndex = firstHumanIdx >= 0 ? firstHumanIdx : 0;

  const profiles = engine.profiles.getAll();
  const mapping = new Map<number, ReturnType<typeof engine.profiles.getAll>[number]>();
  let index = 0;
  for (const bot of bots) {
    const profile = profiles[index % Math.max(1, profiles.length)];
    mapping.set(bot.id, profile);
    index += 1;
  }
  runtime.botProfiles = mapping;
}

export function getCurrentPickerId(engine: BotEngineService, roomId: string): number | null {
  const runtime = engine.rooms.get(roomId);
  if (!runtime?.order?.length) return null;
  const index = runtime.pickerIndex ?? 0;
  return runtime.order[index] ?? null;
}

export function getCurrentAnswererId(engine: BotEngineService, roomId: string): number | null {
  const runtime = engine.rooms.get(roomId);
  if (!runtime?.order?.length) return null;
  const index = runtime.answerIndex ?? runtime.pickerIndex ?? 0;
  return runtime.order[index] ?? null;
}

export function nextIndexInOrder(engine: BotEngineService, roomId: string, index: number): number {
  const runtime = engine.rooms.get(roomId);
  const length = runtime?.order?.length ?? 0;
  if (!length) return 0;
  return (index + 1) % length;
}

export async function botAutoPick(engine: BotEngineService, roomId: string): Promise<void> {
  const runtime = engine.rooms.get(roomId);
  if (!runtime?.running) return;

  await ensureBoard(engine, roomId);
  const candidates = (runtime.board ?? []).filter((category) => category.values.length > 0);
  if (!candidates.length) {
    runtime.pickerIndex = nextIndexInOrder(engine, roomId, runtime.pickerIndex ?? 0);
    await schedulePrepare(engine, roomId);
    return;
  }

  const category = candidates[Math.floor(engine.rand() * candidates.length)];
  const valueIndex = Math.floor(engine.rand() * category.values.length);
  const value = category.values[valueIndex];

  category.values.splice(valueIndex, 1);
  engine.emitBoardState(roomId);

  runtime.question = await loadQuestion(engine, category.title, value);
  runtime.questionStartPickerIndex = runtime.pickerIndex ?? 0;
  runtime.answerIndex = runtime.pickerIndex ?? 0;
  const answererId = getCurrentAnswererId(engine, roomId);
  runtime.activePlayerId = answererId ?? null;

  engine.goto(roomId, 'answer_wait', Date.now() + engine.config.answerWaitBotMs);
  void engine.onEnterAnswerWait(roomId);
  if (typeof answererId === 'number') {
    engine.scheduleBotThinkAndAnswer(roomId, answererId);
  }
}

export async function ensureSuperAssignmentsForRound(engine: BotEngineService, roomId: string): Promise<void> {
  const runtime = engine.rooms.get(roomId);
  if (!runtime?.board) return;

  await ensureSession(engine, roomId);
  const round = runtime.round ?? 1;
  runtime.superCells = runtime.superCells ?? new Map();
  if (runtime.superCells.has(round)) return;

  const categories = await engine.prisma.category.findMany({ select: { id: true, title: true } });
  const categoryMap = new Map(categories.map((c) => [c.title, c.id] as const));
  const sessionId = runtime.sessionId;
  if (!sessionId) return;

  const existing = await engine.prisma.roomSuperCell.findMany({ where: { sessionId, round } });
  const toKey = (categoryId: string, value: number) => {
    const title = categories.find((c) => c.id === categoryId)?.title;
    return title ? `${title}:${value}` : '';
  };
  let picks = new Set<string>(existing.map((entry) => toKey(entry.categoryId, entry.value)).filter(Boolean) as string[]);

  if (picks.size === 0) {
    const allowedByRound: Record<number, number[]> = { 1: [400], 2: [200, 400] };
    const allowedValues = allowedByRound[round] ?? [400];
    type Cell = { title: string; value: number; categoryId: string };
    const cells: Cell[] = [];
    for (const boardCategory of runtime.board) {
      const categoryId = categoryMap.get(boardCategory.title);
      if (!categoryId) continue;
      for (const value of boardCategory.values) {
        if (!allowedValues.includes(value)) continue;
        cells.push({ title: boardCategory.title, value, categoryId });
      }
    }

    const used = new Set(
      (await engine.prisma.roomSuperCell.findMany({ where: { sessionId }, select: { superQuestionId: true } })).map((x) => x.superQuestionId),
    );

    const pickSuperForCell = async (cell: Cell) => {
      const pool = await engine.prisma.superQuestion.findMany({
        where: { enabled: true, Question: { categoryId: cell.categoryId, value: cell.value } },
        select: { id: true, lastUsedAt: true },
        orderBy: [{ lastUsedAt: 'asc' }],
        take: 50,
      });
      const candidates = pool.filter((item) => !used.has(item.id));
      if (!candidates.length) return null;
      const top = candidates.slice(0, Math.min(5, candidates.length));
      return top[Math.floor(engine.rand() * top.length)] ?? null;
    };

    const already = new Set<string>();
    for (const value of allowedValues) {
      const filtered = cells.filter((cell) => cell.value === value && !already.has(`${cell.title}:${cell.value}`));
      let chosenCell: Cell | null = null;
      let chosenSq: { id: string } | null = null;
      for (const cell of filtered) {
        const sq = await pickSuperForCell(cell);
        if (sq) {
          chosenCell = cell;
          chosenSq = sq;
          break;
        }
      }
      if (!chosenCell || !chosenSq) continue;
      try {
        await engine.prisma.$transaction([
          engine.prisma.roomSuperCell.create({
            data: {
              sessionId,
              round,
              categoryId: chosenCell.categoryId,
              value: chosenCell.value,
              superQuestionId: chosenSq.id,
            },
          }),
          engine.prisma.superQuestion.update({ where: { id: chosenSq.id }, data: { lastUsedAt: new Date() } }),
        ]);
        used.add(chosenSq.id);
        already.add(`${chosenCell.title}:${chosenCell.value}`);
      } catch {
        // ignore and continue
      }
    }

    const newly = await engine.prisma.roomSuperCell.findMany({ where: { sessionId, round } });
    picks = new Set<string>(newly.map((entry) => toKey(entry.categoryId, entry.value)).filter(Boolean) as string[]);
  }

  runtime.superCells.set(round, picks);
}

export async function ensureBlitzAssignmentsForRound(engine: BotEngineService, roomId: string): Promise<void> {
  if (!engine.config.blitzEnabled) return;
  const runtime = engine.rooms.get(roomId);
  if (!runtime?.board) return;
  const round = runtime.round ?? 1;
  if (!engine.config.blitzRounds.includes(round)) return;
  runtime.blitzCells = runtime.blitzCells ?? new Map();
  if (runtime.blitzCells.has(round)) return;

  const allCells: string[] = [];
  for (const category of runtime.board) {
    for (const value of category.values) {
      allCells.push(`${category.title}:${value}`);
    }
  }

  const picks = new Set<string>();
  const required = Math.max(0, engine.config.blitzCellsPerRound);
  const pool = allCells.slice();
  for (let i = 0; i < required && pool.length > 0; i += 1) {
    const index = Math.floor(engine.rand() * pool.length);
    const [key] = pool.splice(index, 1);
    picks.add(String(key));
  }

  runtime.blitzCells.set(round, picks);
}

export async function ensureCellAssignmentsForRound(engine: BotEngineService, roomId: string): Promise<void> {
  const runtime = engine.rooms.get(roomId);
  if (!runtime?.board) return;
  const round = runtime.round ?? 1;
  runtime.cellAssignments = runtime.cellAssignments ?? new Map();
  if (!runtime.cellAssignments.has(round)) runtime.cellAssignments.set(round, new Map());
  const map = runtime.cellAssignments.get(round)!;

  for (const category of runtime.board) {
    const categoryRecord = await engine.prisma.category.findUnique({ where: { title: category.title } });
    if (!categoryRecord) continue;
    for (const value of category.values) {
      const key = `${category.title}:${value}`;
      if (map.has(key)) continue;
      const base = await engine.prisma.question.findFirst({
        where: { categoryId: categoryRecord.id, value },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (base?.id) map.set(key, base.id);
    }
  }
}

export function getAssignedQuestionId(engine: BotEngineService, roomId: string, categoryTitle: string, value: number) {
  const runtime = engine.rooms.get(roomId);
  const round = runtime?.round ?? 1;
  const map = runtime?.cellAssignments?.get(round);
  const key = `${categoryTitle}:${value}`;
  return map?.get(key);
}

export function shouldTriggerBlitz(
  engine: BotEngineService,
  runtime: RoomRuntime | undefined,
  categoryTitle: string,
  value: number,
) {
  if (!engine.config.blitzEnabled) return false;
  const round = runtime?.round ?? 1;
  if (!engine.config.blitzRounds.includes(round)) return false;
  const set = runtime?.blitzCells?.get(round);
  if (!set) return false;
  return set.has(`${categoryTitle}:${value}`);
}

export function shouldTriggerSuper(runtime: RoomRuntime | undefined, categoryTitle: string, value: number) {
  const round = runtime?.round ?? 1;
  const key = `${categoryTitle}:${value}`;
  const set = runtime?.superCells?.get(round);
  if (!set) return false;
  return set.has(key);
}

export async function buildSuperOptionsDbFirst(
  engine: BotEngineService,
  roomId: string,
  categoryTitle: string,
  value: number,
): Promise<string[]> {
  try {
    const runtime = engine.rooms.get(roomId);
    const sessionId = runtime?.sessionId;
    if (sessionId) {
      const category = await engine.prisma.category.findUnique({ where: { title: categoryTitle } });
      if (category) {
        const assigned = await engine.prisma.roomSuperCell.findFirst({
          where: { sessionId, categoryId: category.id, value },
        });
        if (assigned) {
          const superQuestion = await engine.prisma.superQuestion.findUnique({ where: { id: assigned.superQuestionId } });
          const options = Array.isArray((superQuestion as any)?.options)
            ? ((superQuestion as any).options as any[])
                .map((option) => (typeof option === 'string' ? option : String(option?.text ?? '')))
                .filter(Boolean)
            : [];
          if (options.length >= 2) return options.slice(0, 4);
        }
      }
    }
  } catch {
    // ignore and fall back to generated options
  }
  return buildSuperOptions(engine, categoryTitle, value);
}

export async function buildSuperOptions(engine: BotEngineService, categoryTitle: string, value: number): Promise<string[]> {
  const correct = await loadAnswer(engine, categoryTitle, value);
  const correctNorm = normalizeAnswer(correct);
  const candidates = await engine.prisma.question.findMany({
    take: 50,
    orderBy: { createdAt: 'asc' },
    select: { canonicalAnswer: true, rawAnswer: true },
  });
  const pool = new Set<string>();
  for (const candidate of candidates) {
    const answer = (candidate as any).canonicalAnswer || (candidate as any).rawAnswer || '';
    const norm = normalizeAnswer(answer);
    if (!norm || norm === correctNorm) continue;
    pool.add(String(answer));
    if (pool.size >= 30) break;
  }
  const source = Array.from(pool);
  const distractors: string[] = [];
  while (distractors.length < 3 && source.length > 0) {
    const index = Math.floor(engine.rand() * source.length);
    const [pick] = source.splice(index, 1);
    if (normalizeAnswer(pick) !== correctNorm) distractors.push(pick);
  }
  const fallbacks = ['я не знаю', ' то его знает', 'Ёто загадка'];
  for (const fallback of fallbacks) {
    if (distractors.length >= 3) break;
    if (normalizeAnswer(fallback) !== correctNorm) distractors.push(fallback);
  }
  const options = [correct, ...distractors.slice(0, 3)];
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(engine.rand() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return options;
}

export async function loadAnswer(engine: BotEngineService, categoryTitle: string, value: number): Promise<string> {
  try {
    const categoryRecord = await engine.prisma.category.findUnique({ where: { title: categoryTitle } });
    if (!categoryRecord) return '';
    const question = await engine.prisma.question.findFirst({
      where: { categoryId: categoryRecord.id, value },
      orderBy: { createdAt: 'asc' },
      select: { canonicalAnswer: true, rawAnswer: true, answersAccept: true },
    });
    if (!question) return '';
    const canonical: any = (question as any).canonicalAnswer;
    const raw: any = (question as any).rawAnswer;
    const accepts: any = (question as any).answersAccept;
    if (typeof canonical === 'string' && canonical.trim()) return canonical.trim();
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    if (Array.isArray(accepts) && accepts.length && typeof accepts[0] === 'string') return accepts[0];
    return '';
  } catch {
    return '';
  }
}

export async function loadAnswerById(engine: BotEngineService, questionId: string): Promise<string> {
  try {
    const question = await engine.prisma.question.findUnique({
      where: { id: questionId },
      select: { canonicalAnswer: true, rawAnswer: true, answersAccept: true },
    });
    if (!question) return '';
    const canonical: any = (question as any).canonicalAnswer;
    const raw: any = (question as any).rawAnswer;
    const accepts: any = (question as any).answersAccept;
    if (typeof canonical === 'string' && canonical.trim()) return canonical.trim();
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    if (Array.isArray(accepts) && accepts.length && typeof accepts[0] === 'string') return accepts[0];
    return '';
  } catch {
    return '';
  }
}
