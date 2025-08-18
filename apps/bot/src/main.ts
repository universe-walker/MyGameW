import { Bot, InlineKeyboard } from 'grammy';

const botToken = process.env.BOT_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) {
  // eslint-disable-next-line no-console
  console.error('Missing BOT_TELEGRAM_BOT_TOKEN');
  process.exit(1);
}

const WEBAPP_BASE_URL = process.env.BOT_WEBAPP_BASE_URL || process.env.WEBAPP_BASE_URL || '';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';

console.log('🚀 Starting bot...');
console.log('Environment variables:');
console.log(`- BOT_TELEGRAM_BOT_TOKEN: ${botToken}`);
console.log(`- WEBAPP_BASE_URL: ${WEBAPP_BASE_URL || '❌ Missing'}`);
console.log(`- API_BASE_URL: ${API_BASE_URL}`);

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

console.log('🔄 Attempting to start bot...');

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


