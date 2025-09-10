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
  category = {
    findMany: async () => {
      return [0, 1, 2, 3].map((i) => ({
        title: `Cat ${i + 1}`,
        questions: [100, 200, 300, 400, 500].map((v) => ({ value: v })),
      }));
    },
    findUnique: async ({ where: { title } }: any) => {
      if (typeof title === 'string') return { id: 1, title };
      return null;
    },
  };
  question = {
    findFirst: async ({ where: { value } }: any) => {
      return { prompt: `Prompt for ${value}`, canonicalAnswer: 'A', rawAnswer: 'A', answersAccept: ['A'] };
    },
    findMany: async () => {
      return Array.from({ length: 20 }, (_, i) => ({ canonicalAnswer: `Ans${i + 1}`, rawAnswer: `Ans${i + 1}` }));
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
  client = {
    smembers: async (key: string) => {
      const roomId = key.split(':')[1];
      return (this.playersByRoom.get(roomId) || []).map((p) => JSON.stringify(p));
    },
    hgetall: async (_key: string) => ({ createdAt: String(Date.now()), solo: '1' }),
  } as any;
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

  it('round 2: exactly one 200 and one 400 are Super (shows options)', async () => {
    const engine = new BotEngineService(timers as any, profiles as any, telemetry as any, prisma as any, redis as any);
    engine.setServer(server);
    engine.setSeed(101);
    const roomId = 'sgr2-0001-0001-0001-000000000004';
    // Single human so picker is always valid
    redis.setPlayers(roomId, [{ id: 1, name: 'You' }]);
    engine.start(roomId);
    await tick(); await tick();

    // Exhaust round 1 completely (4 cats x 5 values)
    const cats = ['Cat 1', 'Cat 2', 'Cat 3', 'Cat 4'];
    const values = [100, 200, 300, 400, 500];
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

    // Now in round 2: test that exactly one 200 and one 400 produce options
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
    expect(super200).toBe(1);

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
    expect(super400).toBe(1);
  });
});
