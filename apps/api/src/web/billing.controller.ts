import { Body, Controller, HttpException, HttpStatus, Post } from '@nestjs/common';
import { ZInvoiceCreateReq, ZInvoiceCreateRes } from '@mygame/shared';

type CreateInvoiceLinkReq = {
  title: string;
  description: string;
  payload: string;
  currency: 'XTR';
  prices: Array<{ label: string; amount: number }>;
};

@Controller('billing')
export class BillingController {
  @Post('invoice')
  async createInvoice(@Body() body: unknown) {
    const parsed = ZInvoiceCreateReq.safeParse(body);
    if (!parsed.success) {
      throw new HttpException('Invalid request', HttpStatus.BAD_REQUEST);
    }
    const { userId, type, qty } = parsed.data;

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) throw new HttpException('Missing bot token', HttpStatus.INTERNAL_SERVER_ERROR);

    const pricePerLetter = Number(process.env.STARS_PRICE_PER_LETTER || '5'); // default 5 Stars
    const priceQty2 = Number(process.env.STARS_PRICE_TWO_LETTERS || String(pricePerLetter * 2 - 1));

    const amount = qty === 1 ? pricePerLetter : priceQty2;
    const payload = JSON.stringify({ kind: 'purchase', type, qty, userId });
    const req: CreateInvoiceLinkReq = {
      title: qty === 1 ? 'Открыть 1 букву' : 'Пакет 2 букв',
      description: 'Подсказка в раунде: открыть букву в слове',
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
}
