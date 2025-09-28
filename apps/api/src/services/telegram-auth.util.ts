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

export type VerifyInitDataResult = {
  ok: boolean;
  authDate?: number;
  // Detailed diagnostics (optional so existing call sites stay happy)
  signatureValid?: boolean;
  notExpired?: boolean;
  now?: number;
  ttlSeconds?: number;
  ageSeconds?: number;
  hasHash?: boolean;
  hasAuthDate?: boolean;
  hasUser?: boolean;
  reason?: string;
};

export function verifyInitData(initDataRaw: string, botToken: string): VerifyInitDataResult {
  const data = parseInitData(initDataRaw);
  const hasHash = typeof data.hash === 'string' && data.hash.length > 0;
  const hasAuthDate = typeof data.auth_date === 'string' && data.auth_date.length > 0;
  const hasUser = typeof data.user === 'string' && data.user.length > 0;

  const dataCheckString = buildDataCheckString(data);
  // If botToken is empty, signature verification is meaningless. We still compute fields safely.
  const secretKey = crypto.createHash('sha256').update(botToken || '').digest();
  const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const signatureValid = hasHash ? hmac === data.hash : false;

  const authDate = hasAuthDate ? Number(data.auth_date) : undefined;
  const now = Math.floor(Date.now() / 1000);
  const ttlSeconds = 24 * 60 * 60; // 1 day TTL by default
  const ageSeconds = typeof authDate === 'number' && Number.isFinite(authDate) ? Math.max(0, now - authDate) : undefined;
  const notExpired = typeof ageSeconds === 'number' ? ageSeconds < ttlSeconds : false;

  let reason: string | undefined;
  if (!hasHash) reason = 'missing_hash';
  else if (!signatureValid) reason = 'invalid_signature';
  else if (!hasAuthDate) reason = 'missing_auth_date';
  else if (!notExpired) reason = 'expired';

  return {
    ok: Boolean(signatureValid && notExpired),
    authDate,
    signatureValid,
    notExpired,
    now,
    ttlSeconds,
    ageSeconds,
    hasHash,
    hasAuthDate,
    hasUser,
    reason,
  };
}
