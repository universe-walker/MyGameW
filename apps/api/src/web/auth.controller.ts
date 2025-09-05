import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZInitVerifyReq, ZInitVerifyRes } from '@mygame/shared';
import { parseInitData, verifyInitData } from '../services/telegram-auth.util';

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
    const data = parseInitData(initDataRaw);
    const userJson = data.user ? decodeURIComponent(data.user) : null;
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

