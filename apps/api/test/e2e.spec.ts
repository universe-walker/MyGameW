import 'reflect-metadata';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import crypto from 'crypto';
import { AppModule } from '../src/modules/app.module';

// Ensure server-side Telegram bot token exists for verify endpoint during tests
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test-bot-token';

let app: INestApplication;

beforeAll(async () => {
  app = await NestFactory.create(AppModule);
  await app.init();
});

afterAll(async () => {
  await app.close();
});

describe('E2E smoke', () => {
  it('GET /healthz 200', async () => {
    const res = await request(app.getHttpServer()).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('POST /auth/telegram/verify with valid HMAC', async () => {
    const token = process.env.TELEGRAM_BOT_TOKEN || 'test-bot-token';
    const user = encodeURIComponent(JSON.stringify({ id: 1, first_name: 'E2E' }));
    const auth_date = Math.floor(Date.now() / 1000);
    const params = new URLSearchParams({ auth_date: String(auth_date), query_id: 'q', user });
    const data: Record<string, string> = {};
    for (const [k, v] of params.entries()) data[k] = v;
    const entries = Object.entries(data)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    const secret = crypto.createHash('sha256').update(token).digest();
    const hash = crypto.createHmac('sha256', secret).update(entries).digest('hex');
    params.set('hash', hash);
    const initDataRaw = params.toString();

    const res = await request(app.getHttpServer())
      .post('/auth/telegram/verify')
      .send({ initDataRaw });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
  });
});


