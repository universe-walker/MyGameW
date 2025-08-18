import { Injectable } from '@nestjs/common';

@Injectable()
export class TelemetryService {
  soloStarted(roomId: string) {
    // Replace with real metrics later
    // eslint-disable-next-line no-console
    console.log('[telemetry] solo_started', { roomId });
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
}
