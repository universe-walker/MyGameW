import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZInitVerifyReq, ZInitVerifyRes } from '@mygame/shared';
import crypto from 'crypto';

function parseInitData(initDataRaw: string) {
  const params = new URLSearchParams(initDataRaw);
  const data: Record<string, string> = {};
  for (const [key, value] of params.entries()) data[key] = value;
  return data;
}

function buildDataCheckString(data: Record<string, string>) {
  const entries = Object.entries(data)
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`);
  return entries.join('\n');
}

function verifyInitData(initDataRaw: string, botToken: string): { ok: boolean; authDate?: number } {
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

@Controller('auth/telegram')
export class AuthController {
  @Post('verify')
  verify(@Body() body: unknown) {
    const parsed = ZInitVerifyReq.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Invalid request');
    }
    const { initDataRaw } = parsed.data;
    const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TELEGRAM_BOT_TOKEN || '';
    const res = verifyInitData(initDataRaw, botToken);
    if (!res.ok) throw new BadRequestException('Invalid initData');
    const url = new URLSearchParams(initDataRaw);
    const userEncoded = url.get('user');
    const userJson = userEncoded ? decodeURIComponent(userEncoded) : null;
    const user = userJson
      ? (JSON.parse(userJson) as { id: number; username?: string; first_name: string })
      : null;
    const response = ZInitVerifyRes.parse({
      ok: true,
      user: { id: user?.id ?? 0, username: user?.username ?? null, first_name: user?.first_name ?? '' },
      issuedAt: res.authDate ?? Math.floor(Date.now() / 1000),
    });
    return response;
  }
}

export const __test__ = { parseInitData, buildDataCheckString, verifyInitData };


