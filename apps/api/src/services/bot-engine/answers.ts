import type { BotEngineService } from '../bot-engine.service';
import { buildMaskPayload, getTestHints, isNearMiss, normalizeAnswer } from './utils';

export async function onHumanAnswer(engine: BotEngineService, roomId: string, playerId: number, text: string): Promise<void> {
  const runtime = engine.rooms.get(roomId);
  if (!runtime || runtime.phase !== 'answer_wait') return;
  if (runtime.activePlayerId !== playerId) return;

  let correct = false;
  try {
    const normalizedInput = normalizeAnswer(text);
    if (runtime.questionId) {
      const question = await engine.prisma.question.findUnique({
        where: { id: runtime.questionId },
        select: { canonicalAnswer: true, answersAccept: true, answersReject: true, requireFull: true },
      });
      const accepts = (question?.answersAccept ?? []).map(normalizeAnswer);
      const rejects = (question?.answersReject ?? []).map(normalizeAnswer);
      const canonical = normalizeAnswer(question?.canonicalAnswer ?? '');
      const requireFull = Boolean(question?.requireFull);
      if (normalizedInput.length > 0) {
        if (rejects.includes(normalizedInput)) correct = false;
        else if (requireFull) correct = accepts.includes(normalizedInput) || (!!canonical && normalizedInput === canonical);
        else correct = accepts.includes(normalizedInput) || (!!canonical && normalizedInput === canonical);
      }
    } else if (runtime.question?.category && typeof runtime.question.value === 'number') {
      const categoryRecord = await engine.prisma.category.findUnique({ where: { title: runtime.question.category } });
      if (categoryRecord) {
        const question = await engine.prisma.question.findFirst({
          where: { categoryId: categoryRecord.id, value: runtime.question.value },
          select: { canonicalAnswer: true, answersAccept: true, answersReject: true, requireFull: true },
        });
        const accepts = (question?.answersAccept ?? []).map(normalizeAnswer);
        const rejects = (question?.answersReject ?? []).map(normalizeAnswer);
        const canonical = normalizeAnswer(question?.canonicalAnswer ?? '');
        const requireFull = Boolean(question?.requireFull);
        if (normalizedInput.length > 0) {
          if (rejects.includes(normalizedInput)) correct = false;
          else if (requireFull) correct = accepts.includes(normalizedInput) || (!!canonical && normalizedInput === canonical);
          else correct = accepts.includes(normalizedInput) || (!!canonical && normalizedInput === canonical);
        }
      }
    }
  } catch {
    correct = false;
  }

  if (correct) {
    runtime.lastAnswerCorrect = true;
    engine.goto(roomId, 'score_apply', Date.now() + engine.config.scoreApplyMs);
    if (runtime.blitzActive) {
      engine.timers.set(roomId, 'phase_score_apply', engine.config.scoreApplyMs, () => engine.advanceAfterBlitzScore(roomId));
    } else {
      engine.timers.set(roomId, 'phase_score_apply', engine.config.scoreApplyMs, () => engine.advanceAfterScore(roomId));
    }
    return;
  }

  try {
    const question = runtime.question;
    if (!runtime.retryUsed && question?.category && typeof question.value === 'number') {
      const categoryRecord = await engine.prisma.category.findUnique({ where: { title: question.category } });
      const normalizedInput = normalizeAnswer(text);
      if (categoryRecord) {
        const storedQuestion = await engine.prisma.question.findFirst({
          where: { categoryId: categoryRecord.id, value: question.value },
          select: { canonicalAnswer: true },
        });
        const canonical = normalizeAnswer(storedQuestion?.canonicalAnswer ?? '');
        if (canonical && normalizedInput) {
          const near = isNearMiss(normalizedInput, canonical);
          if (near) {
            runtime.retryUsed = true;
            try {
              engine.server?.to(roomId).emit('answer:near_miss', { message: 'Почти! Попробуй ещё раз.' } as any);
            } catch (error) {
              void error;
            }
            if (runtime.blitzActive) {
              runtime.until = Date.now() + engine.config.blitzRetryMs;
              engine.emitPhase(roomId, 'answer_wait', runtime.until);
              engine.timers.set(roomId, 'phase_answer_wait', engine.config.blitzRetryMs, () => {
                const retryRuntime = engine.rooms.get(roomId);
                if (!retryRuntime || !retryRuntime.blitzActive) return;
                retryRuntime.lastAnswerCorrect = false;
                engine.goto(roomId, 'score_apply', Date.now() + engine.config.scoreApplyMs);
                engine.timers.set(roomId, 'phase_score_apply', engine.config.scoreApplyMs, () => engine.advanceAfterBlitzScore(roomId));
              });
            }
            return;
          }
        }
      }
    }
  } catch {
    // ignore
  }

  runtime.lastAnswerCorrect = false;
  engine.goto(roomId, 'score_apply', Date.now() + engine.config.scoreApplyMs);
  if (runtime.blitzActive) {
    engine.timers.set(roomId, 'phase_score_apply', engine.config.scoreApplyMs, () => engine.advanceAfterBlitzScore(roomId));
  } else {
    engine.timers.set(roomId, 'phase_score_apply', engine.config.scoreApplyMs, () => engine.advanceAfterScore(roomId));
  }
}

export async function onEnterAnswerWait(engine: BotEngineService, roomId: string): Promise<void> {
  const runtime = engine.rooms.get(roomId);
  if (!runtime) return;

  runtime.retryUsed = false;
  const activeId = runtime.activePlayerId;
  const isHuman = typeof activeId === 'number' ? activeId >= 0 : false;
  if (!isHuman) return;

  try {
    let answerText = '';
    if (runtime.questionId) {
      answerText = await engine.loadAnswerById(runtime.questionId);
    } else {
      const category = runtime.question?.category;
      const value = runtime.question?.value;
      if (!category || typeof value !== 'number') return;
      answerText = await engine.loadAnswer(category, value);
    }
    if (!answerText) return;

    let canReveal = getTestHints() > 0;
    if (!canReveal) {
      try {
        const meta = await engine.prisma.userMeta.findUnique({ where: { userId: BigInt(activeId!) } });
        canReveal = (meta?.hintAllowance ?? 0) > 0;
      } catch {
        canReveal = false;
      }
    }

    const payload = buildMaskPayload(answerText, canReveal);
    runtime.answerText = answerText;
    runtime.currentMask = payload.mask;
    runtime.hintUsage = runtime.hintUsage ?? new Map();
    runtime.hintUsage.set(activeId!, { used: 0, revealed: new Set() });

    try {
      engine.server?.to(roomId).emit('word:mask', payload as any);
      if (engine.config.debugAnswer) {
        engine.server?.to(roomId).emit('answer:debug', { text: answerText } as any);
      }
    } catch (error) {
      void error;
    }
  } catch {
    // ignore mask errors
  }
}

export async function attemptRevealLetter(
  engine: BotEngineService,
  roomId: string,
  playerId: number,
  position: number,
): Promise<{ ok: true; position: number; char: string; nextCanReveal: boolean; newMask: string } | { ok: false; error: string }>
{
  const runtime = engine.rooms.get(roomId);
  if (!runtime || runtime.phase !== 'answer_wait') {
    return { ok: false, error: 'Сейчас подсказку получить нельзя.' };
  }
  if (runtime.activePlayerId !== playerId) {
    return { ok: false, error: 'Ход другого игрока.' };
  }

  const mask = runtime.currentMask ?? '';
  const answer = runtime.answerText ?? '';
  if (!mask || !answer) {
    return { ok: false, error: 'Нет активного слова для подсказки.' };
  }

  const maskArr = Array.from(mask);
  const answerArr = Array.from(answer);
  if (position < 0 || position >= maskArr.length) {
    return { ok: false, error: 'Неверная позиция.' };
  }
  if (maskArr[position] !== '*') {
    return { ok: false, error: 'Эта буква уже открыта.' };
  }

  runtime.hintUsage = runtime.hintUsage ?? new Map();
  const usage = runtime.hintUsage.get(playerId) ?? { used: 0, revealed: new Set<number>() };
  const cost = 1 << usage.used;

  const testHints = getTestHints();
  if (testHints > 0) {
    const spentSoFar = (1 << usage.used) - 1;
    if (testHints < spentSoFar + cost) {
      return { ok: false, error: 'Недостаточно тестовых подсказок.' };
    }
    const char = answerArr[position] ?? '*';
    maskArr[position] = char;
    runtime.currentMask = maskArr.join('');
    usage.used += 1;
    usage.revealed.add(position);
    runtime.hintUsage.set(playerId, usage);
    const nextCost = 1 << usage.used;
    const nextCanReveal = testHints >= spentSoFar + cost + nextCost;
    return { ok: true, position, char, nextCanReveal, newMask: runtime.currentMask };
  }

  let remaining = 0;
  try {
    const userId = BigInt(playerId);
    const meta = await engine.prisma.userMeta.findUnique({ where: { userId } });
    const balance = meta?.hintAllowance ?? 0;
    if (balance < cost) {
      return { ok: false, error: 'Недостаточно подсказок на счету.' };
    }
    remaining = balance - cost;
    await engine.prisma.userMeta.update({ where: { userId }, data: { hintAllowance: remaining } });
  } catch {
    return { ok: false, error: 'Не удалось списать подсказки.' };
  }

  const char = answerArr[position] ?? '*';
  maskArr[position] = char;
  runtime.currentMask = maskArr.join('');
  usage.used += 1;
  usage.revealed.add(position);
  runtime.hintUsage.set(playerId, usage);

  const nextCost = 1 << usage.used;
  const nextCanReveal = remaining >= nextCost;
  return { ok: true, position, char, nextCanReveal, newMask: runtime.currentMask };
}

export function scheduleBotThinkAndAnswer(engine: BotEngineService, roomId: string, botPlayerId: number): void {
  const runtime = engine.rooms.get(roomId);
  if (!runtime) return;

  const thinkMs = engine.config.getInt('BOT_THINK_MS', 900);
  engine.emitBotStatus(roomId, botPlayerId, 'thinking');

  const category = runtime.question?.category ?? 'general';
  const value = runtime.question?.value ?? 0;
  const profile = runtime.botProfiles?.get(botPlayerId) ?? engine.profiles.getAll()[0];
  const knowledge = estimateKnow(profile, category);
  const attemptProbability = answerProbability(knowledge, value, profile.riskProfile);

  engine.timers.set(roomId, `bot_answer_${botPlayerId}`, thinkMs, () => {
    const rawBoost = Number(process.env.BOT_ATTEMPT_BOOST);
    const boost = Number.isFinite(rawBoost) ? rawBoost : 1.35;
    const floorByRisk: Record<string, number> = { low: 0.1, mid: 0.2, high: 0.3 };
    const attemptFloor = floorByRisk[profile.riskProfile] ?? 0.2;
    const attemptChance = Math.max(0, Math.min(1, attemptProbability * boost + attemptFloor));

    if (engine.rand() >= attemptChance) {
      engine.emitBotStatus(roomId, botPlayerId, 'passed');
      engine.goto(roomId, 'score_apply', Date.now() + engine.config.scoreApplyMs);
      engine.timers.set(roomId, 'phase_score_apply', engine.config.scoreApplyMs, () => engine.advanceAfterScore(roomId));
      return;
    }

    const rawFloor = Number(process.env.BOT_CORRECT_FLOOR);
    const correctFloor = Number.isFinite(rawFloor) ? rawFloor : 0.2;
    const correctChance = Math.max(correctFloor, knowledge * (1 - profile.mistakeRate));
    const isCorrect = engine.rand() < correctChance;

    engine.emitBotStatus(roomId, botPlayerId, 'answering');
    const latestRuntime = engine.rooms.get(roomId);
    if (latestRuntime) latestRuntime.lastAnswerCorrect = isCorrect;

    engine.goto(roomId, 'score_apply', Date.now() + engine.config.scoreApplyMs);
    engine.timers.set(roomId, 'phase_score_apply', engine.config.scoreApplyMs, () => engine.advanceAfterScore(roomId));
    engine.emitBotStatus(roomId, botPlayerId, isCorrect ? 'correct' : 'wrong');
    engine.telemetry.botAnswer(roomId, botPlayerId, isCorrect ? 'correct' : 'wrong');
  });
}

export function scheduleBotBuzz(engine: BotEngineService, roomId: string): void {
  const bots = pickBotsForRoom(engine, roomId);
  const runtime = engine.rooms.get(roomId);
  if (!runtime) return;

  for (const bot of bots) {
    const [min, max] = bot.buzzReactionMs;
    const delay = Math.floor(min + engine.rand() * (max - min));
    engine.timers.set(roomId, `bot_buzz_${bot.code}`, delay, () => {
      const current = engine.rooms.get(roomId);
      if (!current || current.phase !== 'buzzer_window' || current.activePlayerId) return;
      const category = current.question?.category ?? 'general';
      const value = current.question?.value ?? 0;
      const knowledge = estimateKnow(bot, category);
      const buzzChance = answerProbability(knowledge, value, bot.riskProfile);
      const blind = engine.rand() < bot.blindBuzzRate;
      if (blind || engine.rand() < buzzChance) {
        const playerId = getBotPlayerId(engine, roomId, bot.code);
        current.activePlayerId = playerId;
        engine.emitBotStatus(roomId, playerId, 'buzzed');
        engine.telemetry.botBuzz(roomId, playerId);
        engine.goto(roomId, 'answer_wait', Date.now() + engine.config.answerWaitBotMs);
        const thinkMs = engine.config.getInt('BOT_THINK_MS', 900);
        engine.emitBotStatus(roomId, playerId, 'thinking');
        engine.timers.set(roomId, `bot_answer_${playerId}`, thinkMs, () => {
          const isCorrect = engine.rand() < Math.max(0.1, knowledge * (1 - bot.mistakeRate));
          engine.emitBotStatus(roomId, playerId, 'answering');
          const latestRuntime = engine.rooms.get(roomId);
          if (latestRuntime) latestRuntime.lastAnswerCorrect = isCorrect;
          engine.goto(roomId, 'score_apply', Date.now() + engine.config.scoreApplyMs);
          engine.timers.set(roomId, 'phase_score_apply', engine.config.scoreApplyMs, () => engine.advanceAfterScore(roomId));
          engine.emitBotStatus(roomId, playerId, isCorrect ? 'correct' : 'wrong');
          engine.telemetry.botAnswer(roomId, playerId, isCorrect ? 'correct' : 'wrong');
        });
      }
    });
  }
}

export function estimateKnow(bot: ReturnType<BotEngineService['profiles']['getAll']>[number], category: string): number {
  const byTag = bot.knowledgeByTag;
  const values = Object.values(byTag);
  const average = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0.5;
  const base = byTag[category] ?? byTag['general'] ?? average;
  return bot.valueCurve === 'steep' ? Math.min(1, base * 1.1) : base;
}

export function answerProbability(
  knowledge: number,
  value: number,
  risk: ReturnType<BotEngineService['profiles']['getAll']>[number]['riskProfile'],
): number {
  const riskFactor = { low: 0.6, mid: 0.8, high: 1 }[risk];
  const valueFactor = 1 - Math.min(0.5, value / 2000);
  return Math.min(1, Math.max(0, knowledge * riskFactor * valueFactor));
}

export function getBotPlayerId(engine: BotEngineService, roomId: string, botCode: string): number {
  let map = engine.botPlayerIds.get(roomId);
  if (!map) {
    map = new Map();
    engine.botPlayerIds.set(roomId, map);
  }
  const existing = map.get(botCode);
  if (typeof existing === 'number') return existing;
  const next = engine.nextBotId.get(roomId) ?? -1;
  map.set(botCode, next);
  engine.nextBotId.set(roomId, next - 1);
  return next;
}

export function pickBotsForRoom(engine: BotEngineService, _roomId: string) {
  const all = engine.profiles.getAll();
  return all.slice(0, 2);
}
