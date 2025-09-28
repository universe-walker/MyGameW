import { describe, expect, it } from 'vitest';
import { verifyInitData } from '../src/services/telegram-auth.util';

describe('verifyInitData', () => {
  it('validates correct HMAC and not expired', async () => {
    const token = 'test-bot-token';
    const crypto = await import('crypto');
    const user = encodeURIComponent(JSON.stringify({ id: 1, first_name: 'Test' }));
    const auth_date = Math.floor(Date.now() / 1000);
    const params = new URLSearchParams({
      auth_date: String(auth_date),
      query_id: 'q',
      user,
    });
    const obj: Record<string, string> = {};
    for (const [k, v] of params.entries()) obj[k] = v;
    const entries = Object.entries(obj)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    // For Telegram WebApp, secret = HMAC_SHA256(bot_token) with key "WebAppData"
    const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
    const hash = crypto.createHmac('sha256', secret).update(entries).digest('hex');
    params.set('hash', hash);
    const initDataRaw = params.toString();
    const res = verifyInitData(initDataRaw, token);
    expect(res.ok).toBe(true);
  });

  it('fails on tampered hash', async () => {
    const token = 'test-bot-token';
    const user = encodeURIComponent(JSON.stringify({ id: 1, first_name: 'Bad' }));
    const auth_date = Math.floor(Date.now() / 1000);
    const params = new URLSearchParams({ auth_date: String(auth_date), query_id: 'q', user });
    params.set('hash', 'deadbeef');
    const initDataRaw = params.toString();
    const res = verifyInitData(initDataRaw, token);
    expect(res.ok).toBe(false);
  });

  it('fails on expired auth_date', async () => {
    const token = 'test-bot-token';
    const crypto = await import('crypto');
    const user = encodeURIComponent(JSON.stringify({ id: 1, first_name: 'Expired' }));
    const auth_date = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60; // 2 days ago
    const params = new URLSearchParams({
      auth_date: String(auth_date),
      query_id: 'q',
      user,
    });
    const obj: Record<string, string> = {};
    for (const [k, v] of params.entries()) obj[k] = v;
    const entries = Object.entries(obj)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
    const hash = crypto.createHmac('sha256', secret).update(entries).digest('hex');
    params.set('hash', hash);
    const initDataRaw = params.toString();
    const res = verifyInitData(initDataRaw, token);
    expect(res.ok).toBe(false);
  });
});


