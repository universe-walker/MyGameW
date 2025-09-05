import { describe, expect, it } from 'vitest';
import crypto from 'crypto';
import { parseInitData, buildDataCheckString, verifyInitData } from './telegram-auth.util';

function generateRaw(data: Record<string, string>, botToken: string) {
  const dataCheckString = buildDataCheckString(data);
  const secret = crypto.createHash('sha256').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  const params = new URLSearchParams({ ...data, hash });
  return params.toString();
}

describe('telegram-auth.util', () => {
  it('parseInitData parses query string to object', () => {
    const raw = 'foo=bar&baz=qux';
    expect(parseInitData(raw)).toEqual({ foo: 'bar', baz: 'qux' });
  });

  it('verifyInitData accepts valid data', () => {
    const botToken = 'test_token';
    const data = {
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: encodeURIComponent(JSON.stringify({ id: 1, first_name: 'Alice' })),
    };
    const raw = generateRaw(data, botToken);
    const res = verifyInitData(raw, botToken);
    expect(res.ok).toBe(true);
  });

  it('verifyInitData rejects tampered data', () => {
    const botToken = 'test_token';
    const data = {
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: encodeURIComponent(JSON.stringify({ id: 1, first_name: 'Alice' })),
    };
    const raw = generateRaw(data, botToken);
    const tampered = raw.replace(/auth_date=\d+/, 'auth_date=1');
    const res = verifyInitData(tampered, botToken);
    expect(res.ok).toBe(false);
  });

  it('verifyInitData rejects expired data', () => {
    const botToken = 'test_token';
    const data = {
      auth_date: String(Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60),
      user: encodeURIComponent(JSON.stringify({ id: 1, first_name: 'Alice' })),
    };
    const raw = generateRaw(data, botToken);
    const res = verifyInitData(raw, botToken);
    expect(res.ok).toBe(false);
  });
});
