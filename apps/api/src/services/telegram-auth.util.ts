import crypto from 'crypto';

export function parseInitData(initDataRaw: string) {
  const params = new URLSearchParams(initDataRaw);
  const data: Record<string, string> = {};
  for (const [key, value] of params.entries()) data[key] = value;
  return data;
}

export function buildDataCheckString(data: Record<string, string>) {
  const entries = Object.entries(data)
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`);
  return entries.join('\n');
}

export function verifyInitData(initDataRaw: string, botToken: string): { ok: boolean; authDate?: number } {
  const data = parseInitData(initDataRaw);
  const dataCheckString = buildDataCheckString(data);
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const isValid = hmac === data.hash;
  const authDate = data.auth_date ? Number(data.auth_date) : undefined;
  const now = Math.floor(Date.now() / 1000);
  const maxAge = 24 * 60 * 60; // 1 day TTL by default
  const notExpired = authDate ? now - authDate < maxAge : false;
  return { ok: isValid && notExpired, authDate };
}
