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
    const allowDev = process.env.ALLOW_DEV_NO_TG === '1' || !botToken;

    if (!header) {
      if (allowDev) {
        req.user = { id: 0, first_name: 'Anon' };
        return true;
      }
      throw new UnauthorizedException('Missing Telegram init data');
    }

    const res = verifyInitData(header, botToken);
    if (!res.ok) {
      if (allowDev) {
        req.user = { id: 0, first_name: 'Anon' };
        return true;
      }
      throw new UnauthorizedException('Invalid or expired Telegram init data');
    }

    try {
      const data = parseInitData(header);
      const userJson = data.user ? decodeURIComponent(data.user) : null;
      const user = userJson ? (JSON.parse(userJson) as { id: number; username?: string; first_name?: string }) : null;
      if (!user) {
        // Valid signature but no user payload — treat as unauthorized unless dev override
        if (allowDev) {
          req.user = { id: 0, first_name: 'Anon' };
          return true;
        }
        throw new UnauthorizedException('No user in Telegram init data');
      }
      req.user = { id: user.id, username: user.username, first_name: user.first_name };
    } catch {
      if (allowDev) {
        req.user = { id: 0, first_name: 'Anon' };
        return true;
      }
      throw new UnauthorizedException('Failed to parse Telegram init data');
    }

    return true;
  }
}

