import 'reflect-metadata';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { BillingController } from '../src/web/billing.controller';
import { PrismaService } from '../src/services/prisma.service';

class PrismaServiceMock {
  // in-memory stores
  users = new Map<string, { id: bigint; username: string | null; firstName: string }>();
  metas = new Map<string, { userId: bigint; hintAllowance: number; profileScore: number }>();
  purchases = new Map<string, { userId: bigint; type: string; qty: number; status: string; tgPaymentId: string }>();

  user = {
    upsert: async ({ where: { id }, update, create }: any) => {
      void update;
      const key = String(id);
      if (!this.users.has(key)) {
        this.users.set(key, { id, username: create.username ?? null, firstName: create.firstName ?? 'User' });
      }
      return this.users.get(key);
    },
  };

  userMeta = {
    upsert: async ({ where: { userId }, update, create }: any) => {
      const key = String(userId);
      const existing = this.metas.get(key);
      if (existing) {
        const inc = update?.hintAllowance?.increment ?? 0;
        existing.hintAllowance += inc;
        this.metas.set(key, existing);
        return existing;
      }
      const meta = { userId, hintAllowance: create.hintAllowance ?? 0, profileScore: create.profileScore ?? 0 };
      this.metas.set(key, meta);
      return meta;
    },
  };

  billingPurchase = {
    findFirst: async ({ where: { tgPaymentId } }: any) => {
      const p = this.purchases.get(String(tgPaymentId));
      return p ? { ...p } : null;
    },
    create: async ({ data }: any) => {
      this.purchases.set(String(data.tgPaymentId), { ...data });
      return data;
    },
  };

  $transaction = async <T>(fns: Array<Promise<T>>): Promise<T[]> => {
    // naive sequential execution for test
    const out: T[] = [];
    for (const fn of fns) out.push(await fn);
    return out;
  };
}

describe('BillingController payments', () => {
  let app: INestApplication;
  const OLD_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const OLD_BOT_SECRET = process.env.BILLING_BOT_SECRET;
  const prisma = new PrismaServiceMock() as any as PrismaService;

  beforeAll(async () => {
    // Mock Telegram fetch for invoice creation
    global.fetch = vi.fn(async (url: any, init?: any) => {
      const u = String(url);
      if (u.includes('/createInvoiceLink')) {
        return {
          ok: true,
          json: async () => ({ ok: true, result: 'https://t.me/invoice/mock' }),
          text: async () => 'ok',
        } as any;
      }
      return { ok: true, json: async () => ({}), text: async () => '' } as any;
    }) as any;

    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
    process.env.BILLING_BOT_SECRET = 'secret123';

    const moduleRef = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    // Ensure optional prisma dependency is present on controller instance
    const ctrl = app.get(BillingController) as any;
    (ctrl as any).prisma = prisma;
  });

  afterAll(async () => {
    await app.close();
    process.env.TELEGRAM_BOT_TOKEN = OLD_TOKEN;
    process.env.BILLING_BOT_SECRET = OLD_BOT_SECRET;
  });

  it('POST /billing/invoice returns invoiceLink', async () => {
    const res = await request(app.getHttpServer())
      .post('/billing/invoice')
      .send({ userId: 123, type: 'hint_letter', qty: 1 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ invoiceLink: 'https://t.me/invoice/mock' });
    expect(global.fetch).toHaveBeenCalled();
  });

  it('POST /billing/invoice validates body', async () => {
    const res = await request(app.getHttpServer()).post('/billing/invoice').send({ foo: 'bar' });
    expect(res.status).toBe(400);
  });

  it('POST /billing/confirm rejects without secret', async () => {
    const res = await request(app.getHttpServer()).post('/billing/confirm').send({});
    expect(res.status).toBe(401);
  });

  it('POST /billing/confirm validates input and amount', async () => {
    const payload = { kind: 'purchase', type: 'hint_letter', qty: 1, userId: 777 };
    const body = {
      telegram_payment_charge_id: 'ch_1',
      currency: 'XTR',
      total_amount: 5,
      invoice_payload: JSON.stringify(payload),
    };
    const res = await request(app.getHttpServer())
      .post('/billing/confirm')
      .set('X-Bot-Secret', 'secret123')
      .send(body);
    if (res.status !== 201) {
      // eslint-disable-next-line no-console
      console.error('confirm response', res.status, res.text);
    }
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });

    // meta should be incremented
    const meta = (prisma as any).metas.get(String(BigInt(777)));
    expect(meta?.hintAllowance).toBe(1);

    // second call with same charge id should be idempotent
    const res2 = await request(app.getHttpServer())
      .post('/billing/confirm')
      .set('X-Bot-Secret', 'secret123')
      .send(body);
    expect(res2.status).toBe(201);
    expect(res2.body).toMatchObject({ ok: true, alreadyProcessed: true });
    const meta2 = (prisma as any).metas.get(String(BigInt(777)));
    expect(meta2?.hintAllowance).toBe(1);
  });

  it('POST /billing/confirm fails on amount mismatch', async () => {
    const payload = { kind: 'purchase', type: 'hint_letter', qty: 2, userId: 778 };
    const body = {
      telegram_payment_charge_id: 'ch_bad',
      currency: 'XTR',
      total_amount: 999, // wrong
      invoice_payload: JSON.stringify(payload),
    };
    const res = await request(app.getHttpServer())
      .post('/billing/confirm')
      .set('X-Bot-Secret', 'secret123')
      .send(body);
    expect(res.status).toBe(400);
  });
});
