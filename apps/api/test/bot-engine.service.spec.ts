import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import type { Server } from 'socket.io';
import { BotEngineService } from '../src/services/bot-engine.service';

// Minimal timer registry mock that records timers but does not auto-fire
class TimerRegistryMock {
  public timers: Record<string, { key: string; ms: number; cb: () => void }[]> = {};
  set(roomId: string, key: string, ms: number, cb: () => void) {
    const arr = (this.timers[roomId] ||= []);
    arr.push({ key, ms, cb });
  }
  clearAll(roomId: string) {
    delete this.timers[roomId];
  }
  // Run first timer for room, optionally filtering by key prefix
  flush(roomId: string, keyPrefix?: string) {
    const arr = this.timers[roomId] || [];
    const idx = arr.findIndex((t) => !keyPrefix || t.key.startsWith(keyPrefix));
    if (idx >= 0) {
      const { cb } = arr.splice(idx, 1)[0];
      cb();
      return true;
    }
    return false;
  }
  // Drain all pending timers for room (in FIFO order)
  flushAll(roomId: string) {
    while (this.flush(roomId)) {}
  }
  pause() {}
  resume() {}
}

// Prisma mock: supplies a board and a prompt/answer for questions
class PrismaMock {
  private _cats = [0, 1, 2, 3].map((i) => ({ id: `c${i + 1}`, title: `Cat ${i + 1}` }));
  private _qs: Record<string, { id: string; value: number; prompt: string; canonicalAnswer: string; rawAnswer: string }[]> = {};
  private _superByQuestion: Record<string, { id: string; questionId: string; options: string[]; lastUsedAt: Date | null; enabled: boolean }[]> = {};
  private _rooms = new Set<string>();
  private _sessions: { id: string; roomId: string; status: 'active' | 'completed'; startedAt: Date; endedAt?: Date }[] = [];
  private _roomSuperCells: { id: string; sessionId: string; round: number | null; categoryId: string; value: number; superQuestionId: string }[] = [];

  constructor() {
    for (const c of this._cats) {
      this._qs[c.id] = [100, 200, 300, 400, 500].map((v, idx) => ({
        id: `${c.id}-q${idx + 1}`,
        value: v,
        prompt: `Prompt ${c.title} ${v}`,
        canonicalAnswer: `Ans-${c.title}-${v}`,
        rawAnswer: `Ans-${c.title}-${v}`,
      }));
    }
  }

  $transaction = async (ops: any[]) => {
    const results = [] as any[];
    for (const p of ops) results.push(await p);
    return results;
  };

  room = {
    findUnique: async ({ where: { id } }: any) => (this._rooms.has(id) ? { id } : null),
    upsert: async ({ where: { id }, create: { id: cid } }: any) => {
      this._rooms.add(id ?? cid);
      return { id: id ?? cid };
    },
  };

  roomSession = {
    findFirst: async ({ where: { roomId, status } }: any) =>
      this._sessions.find((s) => s.roomId === roomId && (!status || s.status === status)) || null,
    create: async ({ data: { roomId } }: any) => {
      const id = `s-${this._sessions.length + 1}`;
      const s = { id, roomId, status: 'active' as const, startedAt: new Date() };
      this._sessions.push(s);
      return s;
    },
    update: async ({ where: { id }, data }: any) => {
      const s = this._sessions.find((x) => x.id === id);
      if (s) Object.assign(s, data);
      return s ?? null;
    },
  };

  category = {
    findMany: async ({ include, select }: any = {}) => {
      if (include?.questions) {
        return this._cats.map((c) => ({
          title: c.title,
          ...(select?.id ? { id: c.id } : {}),
          questions: this._qs[c.id].map((q) => ({ value: q.value })),
        }));
      }
      if (select?.id && select?.title) return this._cats.map((c) => ({ id: c.id, title: c.title }));
      if (select?.id) return this._cats.map((c) => ({ id: c.id }));
      return this._cats.map((c) => ({ title: c.title }));
    },
    findUnique: async ({ where: { title } }: any) => {
      const c = this._cats.find((x) => x.title === title);
      return c ? { id: c.id, title: c.title } : null;
    },
  };

  question = {
    findFirst: async ({ where: { categoryId, value }, select }: any) => {
      const arr = this._qs[categoryId] || [];
      const q = arr.find((x) => x.value === value) || null;
      if (!q) return null;
      if (select?.prompt) return { prompt: q.prompt };
      if (select?.canonicalAnswer || select?.rawAnswer || select?.answersAccept) {
        return { canonicalAnswer: q.canonicalAnswer, rawAnswer: q.rawAnswer, answersAccept: [q.canonicalAnswer] };
      }
      return q;
    },
    findMany: async ({ take, select }: any = {}) => {
      const flat = Object.values(this._qs).flat();
      const arr = flat.slice(0, take || flat.length);
      if (select?.canonicalAnswer || select?.rawAnswer) {
        return arr.map((q) => ({ canonicalAnswer: q.canonicalAnswer, rawAnswer: q.rawAnswer }));
      }
      return arr;
    },
  };

  private ensureSuperPool(categoryId: string, value: number) {
    const q = (this._qs[categoryId] || []).find((x) => x.value === value);
    if (!q) return [] as any[];
    const list = (this._superByQuestion[q.id] ||= []);
    if (list.length === 0) {
      for (let i = 0; i < 3; i++) {
        list.push({
          id: `sq-${q.id}-${i + 1}`,
          questionId: q.id,
          options: [q.canonicalAnswer, `D${i}-1`, `D${i}-2`, `D${i}-3`],
          lastUsedAt: null,
          enabled: true,
        });
      }
    }
    return list;
  }

  superQuestion = {
    findMany: async ({ where: { enabled, Question }, select, orderBy, take }: any) => {
      const list = this.ensureSuperPool(Question.categoryId, Question.value).filter((s) => (enabled ? s.enabled : true));
      let arr = [...list];
      arr.sort((a, b) => {
        const av = a.lastUsedAt ? a.lastUsedAt.getTime() : -1;
        const bv = b.lastUsedAt ? b.lastUsedAt.getTime() : -1;
        return av - bv;
      });
      if (typeof take === 'number') arr = arr.slice(0, take);
      if (select?.id || select?.lastUsedAt) return arr.map((s) => ({ id: s.id, lastUsedAt: s.lastUsedAt }));
      return arr;
    },
    findUnique: async ({ where: { id } }: any) => {
      for (const list of Object.values(this._superByQuestion)) {
        const sq = list.find((x) => x.id === id);
        if (sq) return { id: sq.id, options: sq.options } as any;
      }
      return null;
    },
    update: async ({ where: { id }, data: { lastUsedAt } }: any) => {
      for (const list of Object.values(this._superByQuestion)) {
        const sq = list.find((x) => x.id === id);
        if (sq) {
          sq.lastUsedAt = lastUsedAt ?? sq.lastUsedAt;
          return { id: sq.id } as any;
        }
      }
      return null;
    },
  };

  roomSuperCell = {
    findMany: async ({ where, select }: any) => {
      const arr = this._roomSuperCells.filter((r) => (!where?.sessionId || r.sessionId === where.sessionId) && (!where?.round || r.round === where.round));
      if (select?.superQuestionId) return arr.map((r) => ({ superQuestionId: r.superQuestionId }));
      if (select?.categoryId || select?.value) return arr.map((r) => ({ categoryId: r.categoryId, value: r.value }));
      return arr;
    },
    findFirst: async ({ where }: any) =>
      this._roomSuperCells.find(
        (r) => r.sessionId === where.sessionId && r.categoryId === where.categoryId && r.value === where.value,
      ) || null,
    create: async ({ data }: any) => {
      const id = `rsc-${this._roomSuperCells.length + 1}`;
      const rec = { id, sessionId: data.sessionId, round: data.round ?? null, categoryId: data.categoryId, value: data.value, superQuestionId: data.superQuestionId };
      if (
        this._roomSuperCells.some((r) => r.sessionId === rec.sessionId && r.categoryId === rec.categoryId && r.value === rec.value) ||
        this._roomSuperCells.some((r) => r.sessionId === rec.sessionId && r.superQuestionId === rec.superQuestionId)
      ) {
        throw new Error('Unique constraint violation (mock)');
      }
      this._roomSuperCells.push(rec);
      return rec;
    },
  };
}

// Bot profiles mock: return minimal set used by engine
class BotProfilesMock {
  getAll() {
    return [
      {
        code: 'bot1',
        displayName: 'Bot #1',
        knowledgeByTag: { general: 0.5 },
        riskProfile: 'mid' as const,
        mistakeRate: 0.15,
        valueCurve: 'flat' as const,
      },
      {
        code: 'bot2',
        displayName: 'Bot #2',
        knowledgeByTag: { general: 0.4 },
        riskProfile: 'low' as const,
        mistakeRate: 0.2,
        valueCurve: 'flat' as const,
      },
    ];
  }
}

class TelemetryMock {
  soloStarted() {}
  botAnswer() {}
}

// Redis mock: room players and meta
class RedisMock {
  private playersByRoom = new Map<string, any[]>();
  client = {
    smembers: async (key: string) => {
      const roomId = key.split(':')[1];
      const arr = (this.playersByRoom.get(roomId) || []).map((p) => JSON.stringify(p));
      return arr;
    },
    hgetall: async (_key: string) => ({ createdAt: String(Date.now()), solo: '1' }),
  } as any;

  setPlayers(roomId: string, players: any[]) {
    this.playersByRoom.set(roomId, players);
  }
}

// Socket.io server mock capturing events per room
function createServerMock() {
  const events: Record<string, { event: string; payload: any }[]> = {};
  const server: Partial<Server> & { __events: typeof events } = {
    __events: events,
    to(roomId: string) {
      return {
        emit: (event: string, payload: any) => {
          (events[roomId] ||= []).push({ event, payload });
        },
      } as any;
    },
  };
  return server as Server & { __events: typeof events };
}

describe('BotEngineService game flow (expected behavior)', () => {
  let timers: TimerRegistryMock;
  let prisma: PrismaMock;
  let profiles: BotProfilesMock;
  let telemetry: TelemetryMock;
  let redis: RedisMock;
  let server: ReturnType<typeof createServerMock>;

  beforeEach(() => {
    timers = new TimerRegistryMock();
    prisma = new PrismaMock();
    profiles = new BotProfilesMock();
    telemetry = new TelemetryMock();
    redis = new RedisMock();
    server = createServerMock();
  });

  async function tick() {
    await new Promise((r) => setImmediate(r));
  }

  it('emits prepare with picker and publishes board on start', async () => {
    const engine = new BotEngineService(timers as any, profiles as any, telemetry as any, prisma as any, redis as any);
    engine.setServer(server);
    const roomId = '11111111-1111-1111-1111-111111111111';
    // One human and two bots in the room
    redis.setPlayers(roomId, [
      { id: 1, name: 'You' },
      { id: -1, name: 'Bot #1', bot: true },
      { id: -2, name: 'Bot #2', bot: true },
    ]);

    engine.start(roomId);
    // allow async tasks inside start (ensureBoard + schedulePrepare) to run
    await tick();
    await tick();

    const evs = server.__events[roomId] || [];
    const boardEvents = evs.filter((e) => e.event === 'board:state');
    expect(boardEvents.length).toBeGreaterThanOrEqual(1);
    const phaseEvents = evs.filter((e) => e.event === 'game:phase');
    expect(phaseEvents.length).toBeGreaterThanOrEqual(1);
    const lastPhase = phaseEvents[phaseEvents.length - 1]?.payload;
    expect(lastPhase?.phase).toBe('prepare');
    // Human is the first picker
    expect(lastPhase?.activePlayerId).toBe(1);
    // Has an ETA for the phase end
    expect(typeof lastPhase?.until).toBe('number');
  });

  it('after human picks, emits answer_wait with question visible to all', async () => {
    const engine = new BotEngineService(timers as any, profiles as any, telemetry as any, prisma as any, redis as any);
    engine.setServer(server);
    const roomId = '22222222-2222-2222-2222-222222222222';
    redis.setPlayers(roomId, [
      { id: 1, name: 'You' },
      { id: -1, name: 'Bot #1', bot: true },
    ]);
    engine.start(roomId);
    await tick();
    await tick();

    // Wait until we actually entered prepare (engine sets picker etc.)
    {
      let tries = 0;
      while (tries++ < 10) {
        const evs = server.__events[roomId] || [];
        const pe = evs.filter((e) => e.event === 'game:phase').at(-1)?.payload;
        if (pe?.phase === 'prepare') break;
        await tick();
      }
    }

    // Human selects first category/value
    await engine.onBoardPick(roomId, 'Cat 1', 100, 1);
    await tick();

    const evs = server.__events[roomId] || [];
    const phaseEvents = evs.filter((e) => e.event === 'game:phase');
    const last = phaseEvents[phaseEvents.length - 1]?.payload;
    expect(last?.phase).toBe('answer_wait');
    // Question payload is propagated to clients
    expect(last?.question).toEqual({ category: 'Cat 1', value: 100, prompt: expect.stringContaining('Prompt') });
    // Active answerer is the same human who picked first
    expect(last?.activePlayerId).toBe(1);
  });

  it('bot auto-picks from prepare and proceeds to score_apply', async () => {
    const engine = new BotEngineService(timers as any, profiles as any, telemetry as any, prisma as any, redis as any);
    engine.setServer(server);
    engine.setSeed(123);
    const roomId = '33333333-3333-3333-3333-333333333333';
    // Only bots in the room -> bot is the picker
    redis.setPlayers(roomId, [
      { id: -1, name: 'Bot #1', bot: true },
      { id: -2, name: 'Bot #2', bot: true },
    ]);
    engine.start(roomId);
    await tick();
    await tick();

    // Should be in prepare with a bot as picker
    let evs = server.__events[roomId] || [];
    let phase = evs.filter((e) => e.event === 'game:phase').at(-1)?.payload;
    expect(phase?.phase).toBe('prepare');
    expect(typeof phase?.activePlayerId).toBe('number');
    expect((phase?.activePlayerId ?? 1) < 0).toBe(true);

    // Bot's prepare timer fires -> auto-pick happens -> answer_wait
    timers.flush(roomId, 'phase_prepare');
    await tick();
    evs = server.__events[roomId] || [];
    const hasAnswerWait = evs.some((e) => e.event === 'game:phase' && e.payload?.phase === 'answer_wait');
    expect(hasAnswerWait).toBe(true);

    // Bot thinks/answers -> score_apply
    timers.flush(roomId, 'bot_answer_');
    await tick();
    evs = server.__events[roomId] || [];
    const hasScoreApply = evs.some((e) => e.event === 'game:phase' && e.payload?.phase === 'score_apply');
    expect(hasScoreApply).toBe(true);
  });

  it('wrong answer leads to score_apply → round_end (reveal) → next prepare', async () => {
    const engine = new BotEngineService(timers as any, profiles as any, telemetry as any, prisma as any, redis as any);
    engine.setServer(server);
    const roomId = '44444444-4444-4444-4444-444444444444';
    // Single human player to ensure round_end after failure
    redis.setPlayers(roomId, [{ id: 1, name: 'You' }]);
    engine.start(roomId);
    await tick();
    await tick();

    // Human picks a cell to show a question
    await engine.onBoardPick(roomId, 'Cat 1', 100, 1);
    await tick();
    // Human submits wrong answer
    await engine.onHumanAnswer(roomId, 1, 'definitely wrong');
    await tick();
    // Phase timer to advance from score_apply
    timers.flush(roomId, 'phase_score_apply');
    await tick();

    // Should emit answer:reveal and go to round_end
    let evs = server.__events[roomId] || [];
    const revealEvt = evs.find((e) => e.event === 'answer:reveal');
    expect(!!revealEvt).toBe(true);
    const hasRoundEnd = evs.some((e) => e.event === 'game:phase' && e.payload?.phase === 'round_end');
    expect(hasRoundEnd).toBe(true);

    // Round end timer fires -> next prepare
    timers.flush(roomId, 'phase_round_end');
    await tick();
    evs = server.__events[roomId] || [];
    const lastPhase = evs.filter((e) => e.event === 'game:phase').at(-1)?.payload;
    expect(lastPhase?.phase).toBe('prepare');
    // question cleared before next prepare
    expect(lastPhase?.question).toBeUndefined();
  });
});
