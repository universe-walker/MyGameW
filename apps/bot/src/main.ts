import { Bot, InlineKeyboard } from 'grammy';

const botToken = process.env.BOT_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) {
  // eslint-disable-next-line no-console
  console.error('Missing BOT_TELEGRAM_BOT_TOKEN');
  process.exit(1);
}

const NGROK_HOST = process.env.NGROK_HOST || '';
const RAW_WEBAPP_BASE_URL = process.env.BOT_WEBAPP_BASE_URL || process.env.WEBAPP_BASE_URL || '';
const WEBAPP_BASE_URL = RAW_WEBAPP_BASE_URL || (NGROK_HOST ? `https://${NGROK_HOST}` : '');
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';
const BILLING_BOT_SECRET = process.env.BILLING_BOT_SECRET || '';
const BILLING_ALERT_CHAT_ID = process.env.BILLING_ALERT_CHAT_ID || '';

console.log('🚀 Starting bot...');
console.log('Environment variables:');
console.log(`- BOT_TELEGRAM_BOT_TOKEN: ${botToken}`);
console.log(`- WEBAPP_BASE_URL: ${WEBAPP_BASE_URL || '❌ Missing'}`);
console.log(`- NGROK_HOST: ${NGROK_HOST || '❌ Missing'}`);
console.log(`- API_BASE_URL: ${API_BASE_URL}`);
console.log(`- BILLING_BOT_SECRET: ${BILLING_BOT_SECRET ? 'set' : 'missing'}`);
console.log(`- BILLING_ALERT_CHAT_ID: ${BILLING_ALERT_CHAT_ID ? 'set' : 'missing'}`);

if (!BILLING_BOT_SECRET) {
  console.error('Missing BILLING_BOT_SECRET (required for bot service access)');
  process.exit(1);
}

const bot = new Bot(botToken);

// Global error handler to keep bot alive on unexpected errors
bot.catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[bot] Unhandled error:', (err as any)?.error ?? err);
});

async function createRoomWithRetry(baseUrl: string, attempts = 5, delayMs = 600): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${baseUrl}/bot/rooms`, {
        method: 'POST',
        headers: { 'X-Bot-Secret': BILLING_BOT_SECRET },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { roomId: string };
      if (json?.roomId) return json.roomId;
      throw new Error('Missing roomId in response');
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr ?? new Error('Failed to create room');
}

bot.command('start', async (ctx) => {
  const arg = ctx.match as string | undefined;
  let roomId: string | null = null;
  if (arg && arg.startsWith('room_')) {
    roomId = arg.slice('room_'.length);
  } else {
    try {
      roomId = await createRoomWithRetry(API_BASE_URL);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[bot] Failed to create room via API', e);
      await ctx.reply('Сервер временно недоступен. Попробуйте позже.');
      return;
    }
  }

  if (!WEBAPP_BASE_URL) {
    await ctx.reply(`Комната создана: ${roomId}. WEBAPP_BASE_URL не настроен.`);
    return;
  }
  if (!WEBAPP_BASE_URL.startsWith('https://')) {
    await ctx.reply(
      `Комната создана: ${roomId}. Некорректный WEBAPP_BASE_URL для кнопки Web App в Telegram.\n` +
        `Текущий: ${WEBAPP_BASE_URL}\n` +
        `Требуется: HTTPS-домен (например, https://<ngrok-host>).`
    );
    return;
  }
  const base = WEBAPP_BASE_URL.endsWith('/') ? WEBAPP_BASE_URL.slice(0, -1) : WEBAPP_BASE_URL;
  const url = `${base}/?start_param=room_${roomId}`;
  const keyboard = new InlineKeyboard().webApp('Открыть игру', url);
  await ctx.reply(`Комната создана: ${roomId}`, { reply_markup: keyboard });
});

console.log('🔄 Attempting to start bot...');

// Handle successful payment (Stars). Confirm on API to credit the user.
bot.on('message:successful_payment', async (ctx) => {
  try {
    const sp = (ctx.message as any)?.successful_payment as any;
    if (!sp) return;
    const invoice_payload = sp.invoice_payload as string;
    const telegram_payment_charge_id = (sp.telegram_payment_charge_id || sp.provider_payment_charge_id) as string | undefined;
    const currency = sp.currency as string;
    const total_amount = sp.total_amount as number;
    if (!telegram_payment_charge_id) {
      console.error('[bot] missing payment charge id');
      return;
    }
    const res = await fetch(`${API_BASE_URL}/billing/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bot-Secret': BILLING_BOT_SECRET },
      body: JSON.stringify({ telegram_payment_charge_id, currency, total_amount, invoice_payload }),
    });
    const txt = await res.text().catch(() => '');
    if (!res.ok) {
      console.error('[bot] /billing/confirm failed', res.status, txt);
      if (BILLING_ALERT_CHAT_ID) {
        try {
          await bot.api.sendMessage(Number(BILLING_ALERT_CHAT_ID), `Billing confirm failed:\nstatus=${res.status}\n${txt}`);
        } catch (e) {
          console.error('[bot] failed to alert admin chat', e);
        }
      }
    } else {
      console.log('[bot] /billing/confirm ok', txt);
    }
  } catch (e) {
    console.error('[bot] payment confirm handler error', e);
    if (BILLING_ALERT_CHAT_ID) {
      try {
        await bot.api.sendMessage(Number(BILLING_ALERT_CHAT_ID), `Billing handler error: ${(e as Error)?.message || String(e)}`);
      } catch (e2) {
        console.error('[bot] failed to alert admin chat (handler error)', e2);
      }
    }
  }
});

// In grammY, bot.start() begins long polling and does not resolve until stopped.
// Validate the token first, then start polling without awaiting the promise.
(async () => {
  try {
    const me = await bot.api.getMe();
    console.log('🤖 Bot token is valid');
    console.log(`Bot username: @${me.username}`);
  } catch (error) {
    console.error('❌ Failed to validate bot token or reach Telegram API:', error);
    console.error('Possible causes:');
    console.error('- Invalid bot token');
    console.error('- Network connectivity issues');
    console.error('- Telegram API is down');
    process.exit(1);
  }

  // Start long polling (do not await, it runs until process is stopped)
  bot.start();
  console.log('📨 Long polling started. Bot is ready to receive messages.');

  // Graceful shutdown
  const stop = async () => {
    console.log('🛑 Stopping bot...');
    await bot.stop();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
})();


