import type { BotEngineService } from '../bot-engine.service';
import { createInitialRoomRuntime } from './runtime';
import type { GameMode } from './types';

export function startGame(engine: BotEngineService, roomId: string, mode: GameMode): void {
  if (engine.isRunning(roomId)) return;

  const runtime = createInitialRoomRuntime(mode);
  engine.rooms.set(roomId, runtime);

  void ensureSession(engine, roomId)
    .then(() => engine.ensureBoard(roomId))
    .then(() => engine.emitBoardState(roomId));

  void engine.schedulePrepare(roomId);
  engine.telemetry.matchStarted(roomId, mode);
}

export function stopGame(engine: BotEngineService, roomId: string): void {
  const runtime = engine.rooms.get(roomId);
  if (!runtime) return;

  runtime.running = false;
  engine.timers.clearAll(roomId);

  if (runtime.sessionId) {
    void engine.prisma.roomSession
      .update({
        where: { id: runtime.sessionId },
        data: { status: 'completed', endedAt: new Date() },
      })
      .catch(() => undefined);
  }

  engine.rooms.delete(roomId);
  engine.botPlayerIds.delete(roomId);
  engine.nextBotId.delete(roomId);
  engine.telemetry.matchCompleted(roomId, runtime.mode);
}

export function pauseGame(engine: BotEngineService, roomId: string): void {
  const runtime = engine.rooms.get(roomId);
  if (!runtime) return;
  const allowed = runtime.mode === 'solo' ? engine.config.soloAllowPause : engine.config.multiAllowPause;
  if (!allowed) return;
  engine.timers.pause(roomId);
}

export function resumeGame(engine: BotEngineService, roomId: string): void {
  const runtime = engine.rooms.get(roomId);
  if (!runtime) return;
  const allowed = runtime.mode === 'solo' ? engine.config.soloAllowPause : engine.config.multiAllowPause;
  if (!allowed) return;
  engine.timers.resume(roomId);
}

export async function ensureSession(engine: BotEngineService, roomId: string): Promise<void> {
  const runtime = engine.rooms.get(roomId);
  if (!runtime) return;
  if (runtime.sessionId) return;

  await engine.prisma.room.upsert({ where: { id: roomId }, create: { id: roomId }, update: {} });
  let session = await engine.prisma.roomSession.findFirst({ where: { roomId, status: 'active' } });
  if (!session) {
    session = await engine.prisma.roomSession.create({ data: { roomId } });
  }
  runtime.sessionId = session.id;
}
