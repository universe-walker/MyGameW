import { Body, Controller, Get, HttpException, HttpStatus, Optional, Post, Req, UseGuards } from '@nestjs/common';
import { ZInvoiceCreateReq, ZInvoiceCreateRes, ZBillingPacksRes } from '@mygame/shared';
import { PrismaService } from '../services/prisma.service';
import { z } from 'zod';
import { TelemetryService } from '../services/telemetry.service';
import { TelegramAuthGuard } from './telegram-auth.guard';
import { getTelegramBotToken } from '../config/telegram.util';
import type { Request } from 'express';

type CreateInvoiceLinkReq = {
  title: string;
  description: string;
  payload: string;
  currency: 'XTR';
  prices: Array<{ label: string; amount: number }>;
};

type AuthedRequest = Request & { user?: { id: number; username?: string; first_name?: string } };

@Controller('billing')
export class BillingController {
  constructor(@Optional() private prisma?: PrismaService, @Optional() private telemetry?: TelemetryService) {}

  private parsePacks(envStr: string | undefined): Array<{ qty: number; price: number }> {
    const out: Array<{ qty: number; price: number }> = [];
    if (!envStr) return out;
    const parts = String(envStr)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const p of parts) {
      const [qStr, aStr] = p.split(':').map((x) => x.trim());
      const qty = Number(qStr);
      const price = Number(aStr);
      if (Number.isInteger(qty) && qty > 0 && Number.isFinite(price) && price > 0) {
        out.push({ qty, price });
      }
    }
    const uniq = new Map<number, number>();
    for (const it of out) if (!uniq.has(it.qty)) uniq.set(it.qty, it.price);
    return [...uniq.entries()].map(([qty, price]) => ({ qty, price })).sort((a, b) => a.qty - b.qty);
  }

  private resolvePrice(qty: number): { amount: number; title: string } {
    const packs = this.parsePacks(process.env.STARS_PACKS);
    if (packs.length > 0) {
      const found = packs.find((p) => p.qty === qty);
      if (!found) {
        throw new HttpException('Unsupported quantity', HttpStatus.BAD_REQUEST);
      }
      return { amount: found.price, title: `Подсказки: ${qty} шт` };
    }
    const pricePerLetter = Number(process.env.STARS_PRICE_PER_LETTER || '5');
    const priceQty2 = Number(process.env.STARS_PRICE_TWO_LETTERS || String(pricePerLetter * 2 - 1));
    if (qty === 1) return { amount: pricePerLetter, title: 'Подсказки: 1 шт' };
    if (qty === 2) return { amount: priceQty2, title: 'Подсказки: 2 шт' };
    throw new HttpException('Unsupported quantity', HttpStatus.BAD_REQUEST);
  }

  @Get('packs')
  getPacks() {
    const packs = this.parsePacks(process.env.STARS_PACKS);
    const items =
      packs.length > 0
        ? packs
        : (() => {
            const pricePerLetter = Number(process.env.STARS_PRICE_PER_LETTER || '5');
            const priceQty2 = Number(process.env.STARS_PRICE_TWO_LETTERS || String(pricePerLetter * 2 - 1));
            return [
              { qty: 1, price: pricePerLetter },
              { qty: 2, price: priceQty2 },
            ];
          })();
    return ZBillingPacksRes.parse({ currency: 'XTR', items });
  }

  @Post('invoice')
  @UseGuards(TelegramAuthGuard)
  async createInvoice(@Body() body: unknown, @Req() request?: AuthedRequest) {
    const parsed = ZInvoiceCreateReq.safeParse(body);
    if (!parsed.success) {
      throw new HttpException('Invalid request', HttpStatus.BAD_REQUEST);
    }
    const { userId, type, qty } = parsed.data;

    // Ensure the caller is the same authenticated Telegram user
    const authUserId = Number(request?.user?.id);
    if (!Number.isInteger(authUserId)) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
    if (authUserId !== userId) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }

    const botToken = getTelegramBotToken();
    if (!botToken) throw new HttpException('Missing bot token', HttpStatus.INTERNAL_SERVER_ERROR);

    const { amount, title } = this.resolvePrice(qty);
    const payload = JSON.stringify({ kind: 'purchase', type, qty, userId });
    const invReq: CreateInvoiceLinkReq = {
      title,
      description: 'Покупка подсказок за Stars в Telegram',
      payload,
      currency: 'XTR',
      prices: [{ label: 'Hints', amount }],
    };

    const res = await fetch(`https://api.telegram.org/bot${botToken}/createInvoiceLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invReq),
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
      this.telemetry?.paymentConfirmError('invalid_body');
      throw new HttpException('Invalid body', HttpStatus.BAD_REQUEST);
    }
    const { telegram_payment_charge_id, currency, total_amount, invoice_payload } = parsed.data;
    void currency; // already validated by zod literal

    let payload: { kind: string; type: 'hint_letter'; qty: number; userId: number };
    try {
      payload = JSON.parse(invoice_payload);
    } catch {
      this.telemetry?.paymentConfirmError('invalid_payload');
      throw new HttpException('Invalid payload', HttpStatus.BAD_REQUEST);
    }
    if (payload.kind !== 'purchase' || payload.type !== 'hint_letter') {
      this.telemetry?.paymentConfirmError('unsupported_payload', { payload });
      throw new HttpException('Unsupported payload', HttpStatus.BAD_REQUEST);
    }
    const userIdNum = Number(payload.userId);
    if (!Number.isInteger(userIdNum) || userIdNum <= 0) {
      this.telemetry?.paymentConfirmError('invalid_user_id', { userId: payload.userId });
      throw new HttpException('Invalid userId', HttpStatus.BAD_REQUEST);
    }

    // Validate amount matches configured price
    const packs = this.parsePacks(process.env.STARS_PACKS);
    let expected: number | null = null;
    if (packs.length > 0) {
      const f = packs.find((p) => p.qty === payload.qty);
      expected = f ? f.price : null;
    } else {
      const pricePerLetter = Number(process.env.STARS_PRICE_PER_LETTER || '5');
      const priceQty2 = Number(process.env.STARS_PRICE_TWO_LETTERS || String(pricePerLetter * 2 - 1));
      if (payload.qty === 1) expected = pricePerLetter;
      else if (payload.qty === 2) expected = priceQty2;
      else expected = null;
    }
    if (expected == null) {
      this.telemetry?.paymentConfirmError('unsupported_qty', { qty: payload.qty });
      throw new HttpException('Unsupported quantity', HttpStatus.BAD_REQUEST);
    }
    if (total_amount !== expected) {
      this.telemetry?.paymentConfirmError('amount_mismatch', { total_amount, expected });
      throw new HttpException('Amount mismatch', HttpStatus.BAD_REQUEST);
    }

    if (!this.prisma) {
      this.telemetry?.paymentConfirmError('no_prisma_service');
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
    if (existing) {
      this.telemetry?.paymentConfirmOk(Number(userId), payload.qty, telegram_payment_charge_id);
      return { ok: true, alreadyProcessed: true };
    }

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

    this.telemetry?.paymentConfirmOk(Number(userId), payload.qty, telegram_payment_charge_id);
    return { ok: true };
  }
}
