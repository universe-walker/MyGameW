import {
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RedisService } from '../services/redis.service';
import { ZRoomsJoinReq } from '@mygame/shared';
import crypto from 'crypto';
import { BotEngineService } from '../services/bot-engine.service';

@WebSocketGateway({ namespace: '/game', cors: { origin: true, credentials: true } })
export class GameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(private redis: RedisService, private engine: BotEngineService) {}

  afterInit(server: Server) {
    this.engine.setServer(server);
  }

  handleConnection(client: Socket) {
    const initDataRaw = client.handshake.auth?.initDataRaw as string | undefined;
    const token = process.env.TELEGRAM_BOT_TOKEN || '';
    const allowDev = process.env.ALLOW_DEV_NO_TG === '1' || !token;
    if (!initDataRaw || !verifyInitData(initDataRaw, token).ok) {
      if (!allowDev) {
        client.disconnect(true);
        return;
      }
      // In development, allow connection without Telegram auth
    }
  }

  @SubscribeMessage('rooms:create')
  async onRoomsCreate(@ConnectedSocket() client: Socket) {
    const roomId = crypto.randomUUID();
    const now = Date.now();
    await this.redis.client.hset(`room:${roomId}:meta`, { createdAt: String(now), solo: '0', botCount: '0' });
    const state = { roomId, solo: false, players: [], createdAt: now };
    client.emit('room:state', state as any);
  }

  @SubscribeMessage('rooms:join')
  async onRoomsJoin(@ConnectedSocket() client: Socket, @MessageBody() payload: unknown) {
    const parsed = ZRoomsJoinReq.safeParse(payload);
    if (!parsed.success) return;
    const { roomId } = parsed.data;
    await client.join(roomId);
    const userJson = client.handshake.auth?.user as string | undefined;
    const user = userJson ? (JSON.parse(userJson) as { id: number; first_name: string }) : null;
    const player = user ? { id: user.id, name: user.first_name } : { id: 0, name: 'Anon' };
    await this.redis.client.sadd(`room:${roomId}:players`, JSON.stringify(player));
    const all = await this.redis.client.smembers(`room:${roomId}:players`);
    const players = all.map((p) => JSON.parse(p) as { id: number; name: string; bot?: boolean });
    const meta = await this.redis.client.hgetall(`room:${roomId}:meta`);
    const createdAt = meta.createdAt ? Number(meta.createdAt) : Date.now();
    const solo = meta.solo === '1';
    const state = { roomId, solo, players, createdAt };
    this.server.to(roomId).emit('room:state', state as any);
    if (solo && !this.engine.isRunning(roomId)) {
      this.engine.start(roomId);
    }
    // Publish current board state to the newly joined client(s)
    await this.engine.publishBoardState(roomId);
  }

  @SubscribeMessage('rooms:leave')
  async onRoomsLeave(@ConnectedSocket() client: Socket, @MessageBody() payload: { roomId: string }) {
    const roomId = payload?.roomId;
    if (!roomId) return;
    // Remove player from Redis set if we can identify them
    const userJson = client.handshake.auth?.user as string | undefined;
    const user = userJson ? (JSON.parse(userJson) as { id: number; first_name?: string }) : null;
    const all = await this.redis.client.smembers(`room:${roomId}:players`);
    const playerToRemove = all.find((p) => {
      try {
        const player = JSON.parse(p) as { id: number };
        return user ? player.id === user.id : player.id === 0;
      } catch {
        return false;
      }
    });
    if (playerToRemove) {
      await this.redis.client.srem(`room:${roomId}:players`, playerToRemove);
    }
    await client.leave(roomId);
    // Emit updated room state to remaining clients
    const remaining = await this.redis.client.smembers(`room:${roomId}:players`);
    const players = remaining.map((p) => JSON.parse(p) as { id: number; name: string; bot?: boolean });
    const meta = await this.redis.client.hgetall(`room:${roomId}:meta`);
    const createdAt = meta.createdAt ? Number(meta.createdAt) : Date.now();
    const solo = meta.solo === '1';
    const state = { roomId, solo, players, createdAt };
    this.server.to(roomId).emit('room:state', state as any);
    // If it's a solo room and no human players remain, stop the engine
    if (solo) {
      const hasHuman = players.some((p) => !p.bot);
      if (!hasHuman && this.engine.isRunning(roomId)) {
        this.engine.stop(roomId);
      }
    }
  }

  @SubscribeMessage('solo:pause')
  onSoloPause(@ConnectedSocket() client: Socket, @MessageBody() payload: { roomId: string }) {
    void client; // no-op
    if (!payload?.roomId) return;
    this.engine.pause(payload.roomId);
  }

  @SubscribeMessage('solo:resume')
  onSoloResume(@ConnectedSocket() client: Socket, @MessageBody() payload: { roomId: string }) {
    void client; // no-op
    if (!payload?.roomId) return;
    this.engine.resume(payload.roomId);
  }

  @SubscribeMessage('buzzer:press')
  onBuzzerPress(@ConnectedSocket() client: Socket, @MessageBody() payload: { roomId: string }) {
    const userJson = client.handshake.auth?.user as string | undefined;
    const user = userJson ? (JSON.parse(userJson) as { id: number }) : null;
    if (!payload?.roomId) return;
    const playerId = user?.id ?? 0; // allow Anon in dev to play as id 0
    this.engine.onHumanBuzzer(payload.roomId, playerId);
  }

  @SubscribeMessage('answer:submit')
  onAnswerSubmit(@ConnectedSocket() client: Socket, @MessageBody() payload: { roomId: string; text: string }) {
    const userJson = client.handshake.auth?.user as string | undefined;
    const user = userJson ? (JSON.parse(userJson) as { id: number }) : null;
    if (!payload?.roomId) return;
    const playerId = user?.id ?? 0; // allow Anon in dev
    this.engine.onHumanAnswer(payload.roomId, playerId, payload.text);
  }

  @SubscribeMessage('board:pick')
  async onBoardPick(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string; category: string; value: number },
  ) {
    void client; // no-op for now
    if (!payload?.roomId || !payload?.category || typeof payload?.value !== 'number') return;
    await this.engine.onBoardPick(payload.roomId, payload.category, payload.value);
  }

  @SubscribeMessage('ping')
  onPing(@ConnectedSocket() client: Socket) {
    client.emit('pong');
  }

  async handleDisconnect(client: Socket) {
    const userJson = client.handshake.auth?.user as string | undefined;
    const user = userJson ? (JSON.parse(userJson) as { id: number }) : null;
    // On disconnect, we need to find which room the user was in and remove them.
    // This is important for preventing users from being stuck in a room across sessions.
    const userId = user?.id ?? 0; // 0 for Anon players in dev

    // Scan all rooms for the disconnected player.
    // Note: In a larger-scale application, a more direct mapping like
    // a user ID to room ID lookup would be more efficient than scanning.
    const roomKeys = await this.redis.client.keys('room:*:players');
    for (const key of roomKeys) {
      const members = await this.redis.client.smembers(key);
      const playerToRemove = members.find((p) => {
        try {
          const player = JSON.parse(p) as { id: number; bot?: boolean };
          // Do not remove bots on disconnect, only human players
          return !player.bot && player.id === userId;
        } catch {
          return false;
        }
      });

      if (playerToRemove) {
        const roomId = key.split(':')[1];
        await this.redis.client.srem(key, playerToRemove);

        // Notify the remaining players in the room about the updated state.
        const remaining = await this.redis.client.smembers(key);
        const players = remaining.map((p) => JSON.parse(p));
        const meta = await this.redis.client.hgetall(`room:${roomId}:meta`);
        const state = {
          roomId,
          solo: meta.solo === '1',
          players,
          createdAt: Number(meta.createdAt),
        };
        this.server.to(roomId).emit('room:state', state as any);
        // If it's a solo room and no human players remain, stop the engine
        if (state.solo) {
          const hasHuman = players.some((p: { bot?: boolean }) => !p.bot);
          if (!hasHuman && this.engine.isRunning(roomId)) {
            this.engine.stop(roomId);
          }
        }
      }
    }
  }
}

function parseInitData(initDataRaw: string) {
  const params = new URLSearchParams(initDataRaw);
  const data: Record<string, string> = {};
  for (const [key, value] of params.entries()) data[key] = value;
  return data;
}
function buildDataCheckString(data: Record<string, string>) {
  const entries = Object.entries(data)
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`);
  return entries.join('\n');
}
function verifyInitData(initDataRaw: string, botToken: string): { ok: boolean } {
  const data = parseInitData(initDataRaw);
  const dataCheckString = buildDataCheckString(data);
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const isValid = hmac === data.hash;
  const authDate = data.auth_date ? Number(data.auth_date) : undefined;
  const now = Math.floor(Date.now() / 1000);
  const maxAge = 24 * 60 * 60;
  const notExpired = authDate ? now - authDate < maxAge : false;
  return { ok: isValid && notExpired };
}


