import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { verifyInitData, parseInitData } from '../services/telegram-auth.util';

@Injectable()
export class TelegramAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const req = context.switchToHttp().getRequest<any>();
    const header = (req.headers?.['x-telegram-init-data'] || req.headers?.['x-init-data']) as
      | string
      | undefined;

    const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TELEGRAM_BOT_TOKEN || '';
    const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
    // Dev override is allowed only outside production
    const rawAllowDev = process.env.ALLOW_DEV_NO_TG === '1';
    const allowDev = !isProd && rawAllowDev;
    if (isProd && rawAllowDev) {
      try {
        console.warn('[auth] ALLOW_DEV_NO_TG is set but ignored in production');
      } catch {}
    }

    try {
      // High-level request diagnostics (no secrets)
      console.log('[auth] TelegramAuthGuard: incoming request', {
        headerPresent: Boolean(header),
        initDataLen: header?.length || 0,
        botTokenPresent: Boolean(botToken),
        allowDev,
        url: req?.url,
        method: req?.method,
      });
    } catch {}

    // Fail closed if bot token is missing (misconfiguration)
    if (!botToken) {
      console.error('[auth] Missing TELEGRAM_BOT_TOKEN; rejecting all authenticated requests');
      throw new UnauthorizedException('Server misconfigured: missing Telegram bot token');
    }

    if (!header) {
      if (allowDev) {
        console.warn('[auth] Missing X-Telegram-Init-Data; allowDev=true -> proceed as Anon');
        req.user = { id: 0, first_name: 'Anon' };
        return true;
      }
      console.error('[auth] Missing X-Telegram-Init-Data; rejecting');
      throw new UnauthorizedException('Missing Telegram init data');
    }

    const res = verifyInitData(header, botToken);
    if (!res.ok) {
      if (allowDev) {
        console.warn('[auth] Telegram initData invalid; allowDev=true -> proceed as Anon', {
          reason: res.reason,
          signatureValid: res.signatureValid,
          notExpired: res.notExpired,
          hasHash: res.hasHash,
          hasAuthDate: res.hasAuthDate,
          hasUser: res.hasUser,
          authDate: res.authDate,
          ageSeconds: res.ageSeconds,
          ttlSeconds: res.ttlSeconds,
        });
        req.user = { id: 0, first_name: 'Anon' };
        return true;
      }
      console.error('[auth] Telegram initData invalid; rejecting', {
        reason: res.reason,
        signatureValid: res.signatureValid,
        notExpired: res.notExpired,
        hasHash: res.hasHash,
        hasAuthDate: res.hasAuthDate,
        hasUser: res.hasUser,
        authDate: res.authDate,
        ageSeconds: res.ageSeconds,
        ttlSeconds: res.ttlSeconds,
      });
      throw new UnauthorizedException('Invalid or expired Telegram init data');
    }

    try {
      const data = parseInitData(header);
      const userJson = data.user ? decodeURIComponent(data.user) : null;
      const user = userJson ? (JSON.parse(userJson) as { id: number; username?: string; first_name?: string }) : null;
      if (!user) {
        // Valid signature but no user payload – treat as unauthorized unless dev override
        if (allowDev) {
          console.warn('[auth] Valid signature but no user in initData; allowDev=true -> proceed as Anon');
          req.user = { id: 0, first_name: 'Anon' };
          return true;
        }
        console.error('[auth] Valid signature but no user in initData; rejecting');
        throw new UnauthorizedException('No user in Telegram init data');
      }
      req.user = { id: user.id, username: user.username, first_name: user.first_name };
      try {
        console.log('[auth] Telegram initData verified', {
          userId: user.id,
          ageSeconds: res.ageSeconds,
          authDate: res.authDate,
          ttlSeconds: res.ttlSeconds,
        });
      } catch {}
    } catch {
      if (allowDev) {
        console.warn('[auth] Failed to parse Telegram initData; allowDev=true -> proceed as Anon');
        req.user = { id: 0, first_name: 'Anon' };
        return true;
      }
      console.error('[auth] Failed to parse Telegram initData; rejecting');
      throw new UnauthorizedException('Failed to parse Telegram init data');
    }

    return true;
  }
}
