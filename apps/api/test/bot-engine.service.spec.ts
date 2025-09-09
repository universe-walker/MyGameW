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
