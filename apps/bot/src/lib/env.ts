export function getTelegramBotToken(): string {
  return process.env.BOT_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
}

