import { Bot, InlineKeyboard } from 'grammy';

const botToken = process.env.BOT_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) {
  // eslint-disable-next-line no-console
  console.error('Missing BOT_TELEGRAM_BOT_TOKEN');
  process.exit(1);
}

const WEBAPP_BASE_URL = process.env.BOT_WEBAPP_BASE_URL || process.env.WEBAPP_BASE_URL || '';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';

const bot = new Bot(botToken);

bot.command('start', async (ctx) => {
  const arg = ctx.match as string | undefined;
  let roomId: string | null = null;
  if (arg && arg.startsWith('room_')) {
    roomId = arg.slice('room_'.length);
  } else {
    const res = await fetch(`${API_BASE_URL}/rooms`, { method: 'POST' });
    const json = (await res.json()) as { roomId: string };
    roomId = json.roomId;
  }

  const url = `${WEBAPP_BASE_URL}?start_param=room_${roomId}`;
  const keyboard = new InlineKeyboard().webApp('Открыть игру', url);
  await ctx.reply(`Комната создана: ${roomId}`, { reply_markup: keyboard });
});

bot.start();


