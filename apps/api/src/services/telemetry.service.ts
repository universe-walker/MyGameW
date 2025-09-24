import { Injectable } from '@nestjs/common';

@Injectable()
export class TelemetryService {
  matchStarted(roomId: string, mode: 'solo' | 'multi') {
    // Replace with real metrics later
    // eslint-disable-next-line no-console
    console.log('[telemetry] match_started', { roomId, mode });
  }
  matchCompleted(roomId: string, mode: 'solo' | 'multi') {
    // eslint-disable-next-line no-console
    console.log('[telemetry] match_completed', { roomId, mode });
  }
  botBuzz(roomId: string, playerId: number) {
    // eslint-disable-next-line no-console
    console.log('[telemetry] bot_buzz', { roomId, playerId });
  }
  botAnswer(roomId: string, playerId: number, result: 'correct' | 'wrong') {
    // eslint-disable-next-line no-console
    console.log('[telemetry] bot_answer', { roomId, playerId, result });
  }
  hintUsed(roomId: string, byPlayerId: number) {
    // eslint-disable-next-line no-console
    console.log('[telemetry] hint_used', { roomId, byPlayerId });
  }
  paymentConfirmOk(userId: number, qty: number, chargeId: string) {
    // eslint-disable-next-line no-console
    console.log('[telemetry] payment_confirm_ok', { userId, qty, chargeId });
  }
  paymentConfirmError(reason: string, meta?: Record<string, unknown>) {
    // eslint-disable-next-line no-console
    console.error('[telemetry] payment_confirm_error', { reason, ...(meta || {}) });
  }
}
