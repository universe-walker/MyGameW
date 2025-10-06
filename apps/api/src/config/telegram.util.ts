/**
 * Unified accessor for Telegram bot token.
 * Reads from `TELEGRAM_BOT_TOKEN` or fallback `BOT_TELEGRAM_BOT_TOKEN`.
 * Returns empty string if not configured.
 */
export function getTelegramBotToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TELEGRAM_BOT_TOKEN || '';
}

