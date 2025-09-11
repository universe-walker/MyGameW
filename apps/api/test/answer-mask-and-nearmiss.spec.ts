import { describe, it, expect, beforeEach } from 'vitest';
import { BotEngineService } from '../src/services/bot-engine.service';

function createServiceWithAnswer(answer: string) {
  // Timers: record scheduled callbacks, do not auto-run
  const timers: { items: Array<{ roomId: string; key: string; ms: number; cb: () => void }> } = { items: [] };
  const timerSvc = {
    clearAll: (_roomId: string) => {},
    set: (roomId: string, key: string, ms: number, cb: () => void) => {
      timers.items.push({ roomId, key, ms, cb });
    },
  } as any;

  // Bot profiles (not used in these tests)
  const profiles = { getAll: () => [{ code: 'bot1', buzzReactionMs: [300, 800], riskProfile: 'mid', mistakeRate: 0.2, knowledgeByTag: { general: 0.5 }, valueCurve: 'flat' }] } as any;
  const telemetry = { soloStarted: () => {}, botBuzz: () => {}, botAnswer: () => {} } as any;

  // Minimal Prisma mocks for answer lookup
  const prisma = {
    category: {
      findUnique: async ({ where: { title } }: any) => ({ id: `cat_${title}` }),
    },
    question: {
      findFirst: async ({ where: { value } }: any) => ({ canonicalAnswer: answer, rawAnswer: answer, value }),
      findMany: async () => [],
    },
    roomSession: { update: async () => ({}) },
    roomSuperCell: { findMany: async () => [] },
  } as any;

  const redis = { client: { smembers: async () => [] } } as any;

  const svc = new BotEngineService(timerSvc, profiles, telemetry, prisma, redis);

  // Stub socket server to capture emits
  const events: Array<{ roomId: string; event: string; payload: any }> = [];
  const server = {
    to: (roomId: string) => ({ emit: (event: string, payload: any) => events.push({ roomId, event, payload }) }),
  } as any;
  svc.setServer(server);

  return { svc, timers, events };
}

describe('BotEngineService: word mask + near-miss', () => {
  const roomId = '00000000-0000-4000-8000-000000000001';

  beforeEach(() => {
    // no-op per test
  });

  it('emits word:mask with stars for letters and keeps spaces/hyphens', async () => {
    const correct = 'Hello world-test';
    const { svc, events } = createServiceWithAnswer(correct);
    // Seed runtime with human answer window
    (svc as any).rooms.set(roomId, {
      running: true,
      phase: 'answer_wait',
      question: { category: 'general', value: 100, prompt: 'Q' },
      activePlayerId: 123,
      scores: {},
    });
    await (svc as any).onEnterAnswerWait(roomId);
    const ev = events.find((e) => e.event === 'word:mask');
    expect(ev).toBeTruthy();
    expect(ev?.payload).toMatchObject({ canReveal: false });
    // Expect letters masked, spaces and hyphens visible
    expect(ev?.payload.mask).toBe('***** *****-****');
    // len counts non-space and non-hyphen characters
    expect(typeof ev?.payload.len).toBe('number');
    expect(ev?.payload.len).toBe(14);
  });

  it('on near-miss (distance=1) emits answer:near_miss and stays in answer_wait', async () => {
    const correct = 'hello world';
    const { svc, events } = createServiceWithAnswer(correct);
    (svc as any).rooms.set(roomId, {
      running: true,
      phase: 'answer_wait',
      question: { category: 'general', value: 100, prompt: 'Q' },
      activePlayerId: 123,
      scores: {},
    });
    events.length = 0;
    await svc.onHumanAnswer(roomId, 123, 'hella world');
    const near = events.find((e) => e.event === 'answer:near_miss');
    expect(near).toBeTruthy();
    const rr = (svc as any).rooms.get(roomId);
    expect(rr.phase).toBe('answer_wait');
    expect(rr.retryUsed).toBe(true);
    // No immediate transition to score_apply
    expect(events.some((e) => e.event === 'game:phase' && e.payload?.phase === 'score_apply')).toBe(false);
  });

  it('after near-miss, next wrong submission transitions to score_apply', async () => {
    const correct = 'hello world';
    const { svc, events } = createServiceWithAnswer(correct);
    (svc as any).rooms.set(roomId, {
      running: true,
      phase: 'answer_wait',
      question: { category: 'general', value: 100, prompt: 'Q' },
      activePlayerId: 123,
      scores: {},
    });
    // First: near-miss
    await svc.onHumanAnswer(roomId, 123, 'hella world');
    events.length = 0; // clear to observe next transition
    // Second: wrong again -> should move to score_apply
    await svc.onHumanAnswer(roomId, 123, 'foo');
    const moved = events.find((e) => e.event === 'game:phase' && e.payload?.phase === 'score_apply');
    expect(moved).toBeTruthy();
  });

  it('wrong by more than one letter on first try transitions to score_apply immediately', async () => {
    const correct = 'hello world';
    const { svc, events } = createServiceWithAnswer(correct);
    (svc as any).rooms.set(roomId, {
      running: true,
      phase: 'answer_wait',
      question: { category: 'general', value: 100, prompt: 'Q' },
      activePlayerId: 123,
      scores: {},
    });
    await svc.onHumanAnswer(roomId, 123, 'foo');
    const moved = events.find((e) => e.event === 'game:phase' && e.payload?.phase === 'score_apply');
    expect(moved).toBeTruthy();
    const near = events.find((e) => e.event === 'answer:near_miss');
    expect(near).toBeFalsy();
  });
});
