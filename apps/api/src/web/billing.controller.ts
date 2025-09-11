import { Body, Controller, HttpException, HttpStatus, Optional, Post, Req, UseGuards } from '@nestjs/common';
import { ZInvoiceCreateReq, ZInvoiceCreateRes } from '@mygame/shared';
import { PrismaService } from '../services/prisma.service';
import { TelegramAuthGuard } from './telegram-auth.guard';
import { z } from 'zod';

type CreateInvoiceLinkReq = {
  title: string;
  description: string;
  payload: string;
  currency: 'XTR';
  prices: Array<{ label: string; amount: number }>;
};

@Controller('billing')
export class BillingController {
  constructor(@Optional() private prisma?: PrismaService) {}
  @Post('invoice')
  async createInvoice(@Body() body: unknown) {
    const parsed = ZInvoiceCreateReq.safeParse(body);
    if (!parsed.success) {
      throw new HttpException('Invalid request', HttpStatus.BAD_REQUEST);
    }
    const { userId, type, qty } = parsed.data;

    const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TELEGRAM_BOT_TOKEN;
    if (!botToken) throw new HttpException('Missing bot token', HttpStatus.INTERNAL_SERVER_ERROR);

    const pricePerLetter = Number(process.env.STARS_PRICE_PER_LETTER || '5'); // default 5 Stars
    const priceQty2 = Number(process.env.STARS_PRICE_TWO_LETTERS || String(pricePerLetter * 2 - 1));

    const amount = qty === 1 ? pricePerLetter : priceQty2;
    const payload = JSON.stringify({ kind: 'purchase', type, qty, userId });
    const req: CreateInvoiceLinkReq = {
      title: qty === 1 ? 'Открыть 1 букву' : 'Открыть 2 буквы',
      description: 'Покупка подсказок за Telegram Звезды',
      payload,
      currency: 'XTR',
      prices: [{ label: 'Hints', amount }],
    };

    const res = await fetch(`https://api.telegram.org/bot${botToken}/createInvoiceLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new HttpException(`TG createInvoiceLink failed: ${text}`, HttpStatus.BAD_GATEWAY);
    }
    const json = (await res.json()) as { ok: boolean; result?: string; description?: string };
    if (!json.ok || !json.result) {
      throw new HttpException(`TG createInvoiceLink error: ${json.description || 'unknown'}`, HttpStatus.BAD_GATEWAY);
    }
    return ZInvoiceCreateRes.parse({ invoiceLink: json.result });
  }

  // Minimal credit endpoint to update balance after a successful Stars payment in WebApp
  // NOTE: In production, validate payments via Bot API updates (Stars transactions) and secure payloads.
  @UseGuards(TelegramAuthGuard)
  @Post('credit')
  async credit(@Body() body: unknown, @Req() req?: any) {
    const z = ZInvoiceCreateReq.pick({ type: true, qty: true });
    const parsed = z.safeParse(body);
    if (!parsed.success) {
      throw new HttpException('Invalid request', HttpStatus.BAD_REQUEST);
    }
    const userIdNum = Number(req?.user?.id);
    if (!Number.isInteger(userIdNum) || userIdNum <= 0) {
      throw new HttpException('Auth required', HttpStatus.UNAUTHORIZED);
    }
    const { type, qty } = parsed.data;

    const userId = BigInt(userIdNum);

    if (!this.prisma) {
      throw new HttpException('Server misconfigured: no PrismaService', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // Ensure user exists
    try {
      await this.prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: {
          id: userId,
          firstName: req?.user?.first_name || 'User',
          username: req?.user?.username ?? null,
        },
      });
    } catch {}

    // Credit hint allowance
    await this.prisma.userMeta.upsert({
      where: { userId },
      update: { hintAllowance: { increment: qty } },
      create: { userId, hintAllowance: qty, profileScore: 0 },
    });

    // Log purchase (tgPaymentId placeholder since client-side)
    await this.prisma.billingPurchase.create({
      data: {
        userId,
        type: 'hint_letter',
        qty,
        status: 'paid',
        tgPaymentId: `webapp:${Date.now()}`,
      },
    });

    return { ok: true };
  }

  // Secure endpoint for bot to confirm Stars payments server-side
  @Post('confirm')
  async confirmFromBot(@Body() body: unknown, @Req() req?: any) {
    const headerSecret = (req?.headers?.['x-bot-secret'] || req?.headers?.['x-billing-bot-secret']) as
      | string
      | undefined;
    const botSecret = process.env.BILLING_BOT_SECRET || '';
    if (!botSecret || !headerSecret || headerSecret !== botSecret) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const ZBotConfirmReq = z.object({
      telegram_payment_charge_id: z.string().min(1),
      currency: z.literal('XTR'),
      total_amount: z.number().int().positive(),
      invoice_payload: z.string().min(1),
    });
    const parsed = ZBotConfirmReq.safeParse(body);
    if (!parsed.success) {
      throw new HttpException('Invalid body', HttpStatus.BAD_REQUEST);
    }
    const { telegram_payment_charge_id, currency, total_amount, invoice_payload } = parsed.data;
    void currency; // already validated by zod literal

    let payload: { kind: string; type: 'hint_letter'; qty: 1 | 2; userId: number };
    try {
      payload = JSON.parse(invoice_payload);
    } catch {
      throw new HttpException('Invalid payload', HttpStatus.BAD_REQUEST);
    }
    if (payload.kind !== 'purchase' || payload.type !== 'hint_letter') {
      throw new HttpException('Unsupported payload', HttpStatus.BAD_REQUEST);
    }
    const userIdNum = Number(payload.userId);
    if (!Number.isInteger(userIdNum) || userIdNum <= 0) {
      throw new HttpException('Invalid userId', HttpStatus.BAD_REQUEST);
    }

    // Validate amount matches configured price
    const pricePerLetter = Number(process.env.STARS_PRICE_PER_LETTER || '5');
    const priceQty2 = Number(process.env.STARS_PRICE_TWO_LETTERS || String(pricePerLetter * 2 - 1));
    const expected = payload.qty === 1 ? pricePerLetter : priceQty2;
    if (total_amount !== expected) {
      throw new HttpException('Amount mismatch', HttpStatus.BAD_REQUEST);
    }

    if (!this.prisma) {
      throw new HttpException('Server misconfigured: no PrismaService', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    const userId = BigInt(userIdNum);

    // Ensure user exists
    try {
      await this.prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: {
          id: userId,
          firstName: 'User',
          username: null,
        },
      });
    } catch {}

    // Idempotency: if this charge was already processed, do nothing
    const existing = await this.prisma.billingPurchase.findFirst({ where: { tgPaymentId: telegram_payment_charge_id } });
    if (existing) return { ok: true, alreadyProcessed: true };

    await this.prisma.$transaction([
      this.prisma.userMeta.upsert({
        where: { userId },
        update: { hintAllowance: { increment: payload.qty } },
        create: { userId, hintAllowance: payload.qty, profileScore: 0 },
      }),
      this.prisma.billingPurchase.create({
        data: {
          userId,
          type: 'hint_letter',
          qty: payload.qty,
          status: 'paid',
          tgPaymentId: telegram_payment_charge_id,
        },
      }),
    ]);

    return { ok: true };
  }
}
