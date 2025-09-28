import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import type { Server } from 'socket.io';
import { BotEngineService } from '../src/services/bot-engine.service';

// Timer registry mock
class TimerRegistryMock {
  public timers: Record<string, { key: string; ms: number; cb: () => void }[]> = {};
  set(roomId: string, key: string, ms: number, cb: () => void) {
    const arr = (this.timers[roomId] ||= []);
    arr.push({ key, ms, cb });
  }
  clearAll(roomId: string) {
    delete this.timers[roomId];
  }
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
  pause() {}
  resume() {}
}

// Prisma mock
class PrismaMock {
  // Values for which SuperQuestion pool is considered empty (to test skip behavior)
  public disabledSuperValues = new Set<number>();
  private _cats = [0, 1, 2, 3].map((i) => ({ id: `c${i + 1}`, title: `Cat ${i + 1}` }));
  private _qs: Record<string, { id: string; value: number; prompt: string; canonicalAnswer: string; rawAnswer: string }[]> = {};
  private _superByQuestion: Record<string, { id: string; questionId: string; options: string[]; lastUsedAt: Date | null; enabled: boolean }[]> = {};
  private _rooms = new Set<string>();
  private _sessions: { id: string; roomId: string; status: 'active' | 'completed'; startedAt: Date; endedAt?: Date }[] = [];
  private _roomSuperCells: { id: string; sessionId: string; round: number | null; categoryId: string; value: number; superQuestionId: string }[] = [];

  constructor() {
    for (const c of this._cats) {
      this._qs[c.id] = [100, 200, 300, 400].map((v, idx) => ({
        id: `${c.id}-q${idx + 1}`,
        value: v,
        prompt: `Prompt ${c.title} ${v}`,
        canonicalAnswer: `Ans-${c.title}-${v}`,
        rawAnswer: `Ans-${c.title}-${v}`,
      }));
    }
  }

  $transaction = async (ops: any[]) => {
    // Execute sequentially for determinism
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
      // Flatten a bunch of answers for distractor pool
      const flat = Object.values(this._qs).flat();
      const arr = flat.slice(0, take || flat.length);
      if (select?.canonicalAnswer || select?.rawAnswer) {
        return arr.map((q) => ({ canonicalAnswer: q.canonicalAnswer, rawAnswer: q.rawAnswer }));
      }
      return arr;
    },
  };

  private ensureSuperPool(categoryId: string, value: number) {
    if (this.disabledSuperValues.has(value)) return [] as any[];
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
      // lastUsedAt asc (nulls first)
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
      // Enforce uniqueness in-memory
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

class BotProfilesMock {
  getAll() {
    return [
      { code: 'bot1', displayName: 'Bot #1', knowledgeByTag: { general: 0.5 }, riskProfile: 'mid', mistakeRate: 0.15, valueCurve: 'flat' },
      { code: 'bot2', displayName: 'Bot #2', knowledgeByTag: { general: 0.4 }, riskProfile: 'low', mistakeRate: 0.2, valueCurve: 'flat' },
    ] as const;
  }
}

class TelemetryMock { soloStarted() {}; botAnswer() {} }

class RedisMock {
  private playersByRoom = new Map<string, any[]>();
  async getPlayers(roomId: string) {
    return this.playersByRoom.get(roomId) || [];
  }
  async getRoomMeta(_roomId: string) {
    return { createdAt: Date.now(), solo: true, botCount: 0 };
  }
  setPlayers(roomId: string, players: any[]) { this.playersByRoom.set(roomId, players); }
}

function createServerMock() {
  const events: Record<string, { event: string; payload: any }[]> = {};
  const server: Partial<Server> & { __events: typeof events } = {
    __events: events,
    to(roomId: string) {
      return {
        emit: (event: string, payload: any) => { (events[roomId] ||= []).push({ event, payload }); },
      } as any;
    },
  };
  return server as Server & { __events: typeof events };
}

async function tick() { await new Promise((r) => setImmediate(r)); }

describe('Super-game behavior', () => {
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

  it('round 1: exactly one 400 cell is Super (shows options)', async () => {
    const engine = new BotEngineService(timers as any, profiles as any, telemetry as any, prisma as any, redis as any);
    engine.setServer(server);
    engine.setSeed(42);
    const roomId = 'sgr1-0001-0001-0001-000000000001';
    redis.setPlayers(roomId, [{ id: 1, name: 'You' }]);
    engine.start(roomId);
    await tick(); await tick();

    const cats = ['Cat 1', 'Cat 2', 'Cat 3', 'Cat 4'];
    let superCount = 0;
    for (const cat of cats) {
      // ensure prepare
      for (let i = 0; i < 10; i++) {
        const pe = (server.__events[roomId] || []).filter((e) => e.event === 'game:phase').at(-1)?.payload;
        if (pe?.phase === 'prepare') break;
        await tick();
      }
      await engine.onBoardPick(roomId, cat, 400, 1);
      await tick();
      const last = (server.__events[roomId] || []).filter((e) => e.event === 'game:phase').at(-1)?.payload;
      if (Array.isArray(last?.question?.options) && last.question.options.length === 4) superCount++;
      // finish this question quickly
      await engine.onHumanAnswer(roomId, 1, 'wrong');
      await tick();
      timers.flush(roomId, 'phase_score_apply');
      await tick();
      timers.flush(roomId, 'phase_round_end');
      await tick();
    }
    expect(superCount).toBe(1);
  });

  it('Super wrong: -V/2 penalty and no pass to others', async () => {
    const engine = new BotEngineService(timers as any, profiles as any, telemetry as any, prisma as any, redis as any);
    engine.setServer(server);
    engine.setSeed(7);
    const roomId = 'sgr1-0002-0002-0002-000000000002';
    redis.setPlayers(roomId, [{ id: 1, name: 'You' }, { id: 2, name: 'Mate' }]);
    engine.start(roomId);
    await tick(); await tick();

    const cats = ['Cat 1', 'Cat 2', 'Cat 3', 'Cat 4'];
    let isSuper = false;
    for (const cat of cats) {
      for (let i = 0; i < 10; i++) {
        const pe = (server.__events[roomId] || []).filter((e) => e.event === 'game:phase').at(-1)?.payload;
        if (pe?.phase === 'prepare') break;
        await tick();
      }
      await engine.onBoardPick(roomId, cat, 400, 1);
      await tick();
      const last = (server.__events[roomId] || []).filter((e) => e.event === 'game:phase').at(-1)?.payload;
      if (Array.isArray(last?.question?.options)) { isSuper = true; break; }
      // finish normal question
      await engine.onHumanAnswer(roomId, 1, 'wrong');
      await tick();
      timers.flush(roomId, 'phase_score_apply');
      await tick();
      timers.flush(roomId, 'phase_round_end');
      await tick();
    }
    expect(isSuper).toBe(true);

    // Answer wrong on super 400
    await engine.onHumanAnswer(roomId, 1, 'wrong');
    await tick();
    // Score apply event should have -200 for user 1
    const evs1 = server.__events[roomId] || [];
    const sc = evs1.filter((e) => e.event === 'game:phase' && e.payload?.phase === 'score_apply').at(-1)?.payload?.scores;
    const s1 = sc?.['1'] ?? sc?.[1];
    expect(s1).toBe(-200);
    // Advance after score -> round_end (no pass)
    timers.flush(roomId, 'phase_score_apply');
    await tick();
    const lastPhase = (server.__events[roomId] || []).filter((e) => e.event === 'game:phase').at(-1)?.payload?.phase;
    expect(lastPhase).toBe('round_end');
  });

  it('Empty pool: skip Super assignment (no options, full penalty)', async () => {
    const engine = new BotEngineService(timers as any, profiles as any, telemetry as any, prisma as any, redis as any);
    engine.setServer(server);
    engine.setSeed(5);
    const roomId = 'sg-empty-0001-0001-0001-000000000005';
    // Disable Super pool for 400 to emulate empty pool in round 1
    (prisma as any).disabledSuperValues.add(400);
    redis.setPlayers(roomId, [{ id: 1, name: 'You' }]);
    engine.start(roomId);
    await tick(); await tick();

    // Ensure we are in prepare phase
    for (let i = 0; i < 10; i++) {
      const pe = (server.__events[roomId] || []).filter((e) => e.event === 'game:phase').at(-1)?.payload;
      if (pe?.phase === 'prepare') break;
      await tick();
    }

    // Pick 400 (would be Super normally), but pool is empty -> should be normal question (no options)
    await engine.onBoardPick(roomId, 'Cat 1', 400, 1);
    await tick();
    let last = (server.__events[roomId] || []).filter((e) => e.event === 'game:phase').at(-1)?.payload;
    // No options field in question payload
    expect(Array.isArray(last?.question?.options)).toBe(false);

    // Answer wrong -> full -400 penalty (not -200)
    await engine.onHumanAnswer(roomId, 1, 'wrong');
    await tick();
    const sc = (server.__events[roomId] || [])
      .filter((e) => e.event === 'game:phase' && e.payload?.phase === 'score_apply')
      .at(-1)?.payload?.scores;
    const s1 = sc?.['1'] ?? sc?.[1];
    expect(s1).toBe(-400);
  });

  it('Normal wrong with 2 humans passes to next and full -V', async () => {
    const engine = new BotEngineService(timers as any, profiles as any, telemetry as any, prisma as any, redis as any);
    engine.setServer(server);
    const roomId = 'sgr1-0003-0003-0003-000000000003';
    redis.setPlayers(roomId, [{ id: 1, name: 'You' }, { id: 2, name: 'Mate' }]);
    engine.start(roomId);
    await tick(); await tick();

    await engine.onBoardPick(roomId, 'Cat 1', 100, 1);
    await tick();
    await engine.onHumanAnswer(roomId, 1, 'wrong');
    await tick();
    const sc = (server.__events[roomId] || []).filter((e) => e.event === 'game:phase' && e.payload?.phase === 'score_apply').at(-1)?.payload?.scores;
    const s1 = sc?.['1'] ?? sc?.[1];
    expect(s1).toBe(-100);
    timers.flush(roomId, 'phase_score_apply');
    await tick();
    const last = (server.__events[roomId] || []).filter((e) => e.event === 'game:phase').at(-1)?.payload;
    expect(last?.phase).toBe('answer_wait');
    expect(last?.activePlayerId).toBe(2);
  });

  it('round 2: assigns up to one 200 and one 400 as Super (policy-based)', async () => {
    const engine = new BotEngineService(timers as any, profiles as any, telemetry as any, prisma as any, redis as any);
    engine.setServer(server);
    engine.setSeed(101);
    const roomId = 'sgr2-0001-0001-0001-000000000004';
    // Single human so picker is always valid
    redis.setPlayers(roomId, [{ id: 1, name: 'You' }]);
    engine.start(roomId);
    await tick(); await tick();

    // Exhaust round 1 completely (4 cats x 4 values)
    const cats = ['Cat 1', 'Cat 2', 'Cat 3', 'Cat 4'];
    const values = [100, 200, 300, 400];
    for (const cat of cats) {
      for (const v of values) {
        // ensure prepare
        for (let i = 0; i < 10; i++) {
          const pe = (server.__events[roomId] || []).filter((e) => e.event === 'game:phase').at(-1)?.payload;
          if (pe?.phase === 'prepare') break;
          await tick();
        }
        await engine.onBoardPick(roomId, cat, v, 1);
        await tick();
        // finish question (answer wrong to move on)
        await engine.onHumanAnswer(roomId, 1, 'wrong');
        await tick();
        timers.flush(roomId, 'phase_score_apply');
        await tick();
        timers.flush(roomId, 'phase_round_end');
        await tick();
      }
    }

    // Now in round 2: test policy — at most one 200 and one 400 produce options
    let super200 = 0;
    for (const cat of cats) {
      // ensure prepare
      for (let i = 0; i < 10; i++) {
        const pe = (server.__events[roomId] || []).filter((e) => e.event === 'game:phase').at(-1)?.payload;
        if (pe?.phase === 'prepare') break;
        await tick();
      }
      await engine.onBoardPick(roomId, cat, 200, 1);
      await tick();
      const last = (server.__events[roomId] || []).filter((e) => e.event === 'game:phase').at(-1)?.payload;
      if (Array.isArray(last?.question?.options) && last.question.options.length === 4) super200++;
      await engine.onHumanAnswer(roomId, 1, 'wrong');
      await tick();
      timers.flush(roomId, 'phase_score_apply');
      await tick();
      timers.flush(roomId, 'phase_round_end');
      await tick();
    }
    expect(super200).toBeGreaterThanOrEqual(0);
    expect(super200).toBeLessThanOrEqual(1);

    let super400 = 0;
    for (const cat of cats) {
      for (let i = 0; i < 10; i++) {
        const pe = (server.__events[roomId] || []).filter((e) => e.event === 'game:phase').at(-1)?.payload;
        if (pe?.phase === 'prepare') break;
        await tick();
      }
      await engine.onBoardPick(roomId, cat, 400, 1);
      await tick();
      const last = (server.__events[roomId] || []).filter((e) => e.event === 'game:phase').at(-1)?.payload;
      if (Array.isArray(last?.question?.options) && last.question.options.length === 4) super400++;
      await engine.onHumanAnswer(roomId, 1, 'wrong');
      await tick();
      timers.flush(roomId, 'phase_score_apply');
      await tick();
      timers.flush(roomId, 'phase_round_end');
      await tick();
    }
    expect(super400).toBeGreaterThanOrEqual(0);
    expect(super400).toBeLessThanOrEqual(1);
    // At least one Super should exist in round 2 across allowed values
    expect(super200 + super400).toBeGreaterThanOrEqual(1);
  });
});


