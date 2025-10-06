import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { BillingController } from '../src/web/billing.controller';
import crypto from 'crypto';

// Minimal module registering only the controller under test
describe('BillingController (HTTP)', () => {
  let app: INestApplication;
  const OLD_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

  beforeAll(async () => {
    // Mock Telegram fetch
    global.fetch = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({ ok: true, result: 'https://t.me/invoice/mock' }),
        text: async () => 'ok',
      } as any;
    }) as any;

    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';

    const moduleRef = await Test.createTestingModule({
      controllers: [BillingController],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    process.env.TELEGRAM_BOT_TOKEN = OLD_TOKEN;
  });

  it('POST /billing/invoice returns invoiceLink', async () => {
    const user = { id: 123, username: 'alice', first_name: 'Alice' };
    const initData = buildInitData(user, process.env.TELEGRAM_BOT_TOKEN!);
    const res = await request(app.getHttpServer())
      .post('/billing/invoice')
      .set('X-Telegram-Init-Data', initData)
      .send({ userId: 123, type: 'hint_letter', qty: 1 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ invoiceLink: 'https://t.me/invoice/mock' });
    expect(global.fetch).toHaveBeenCalledOnce();
  });

  function buildInitData(
    user: { id: number; username?: string; first_name?: string },
    botToken: string
  ): string {
    const params: Record<string, string> = {};
    const now = Math.floor(Date.now() / 1000);
    params.user = encodeURIComponent(JSON.stringify(user));
    params.auth_date = String(now);
    const dataCheckString = Object.entries(params)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    const usp = new URLSearchParams({ ...params, hash });
    return usp.toString();
  }
});
