import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class BotSecretGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<any>();
    const header = (req.headers?.['x-bot-secret'] || req.headers?.['x-billing-bot-secret']) as
      | string
      | undefined;

    const secret = process.env.BILLING_BOT_SECRET || '';
    if (!secret) {
      throw new UnauthorizedException('Bot secret is not configured');
    }

    if (!header || header !== secret) {
      throw new UnauthorizedException('Invalid bot secret');
    }

    return true;
  }
}