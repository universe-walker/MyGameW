import {
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RedisService } from '../services/redis.service';
import { ZRoomsJoinReq } from '@mygame/shared';
import crypto from 'crypto';

@WebSocketGateway({ namespace: '/game', cors: { origin: true, credentials: true } })
export class GameGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(private redis: RedisService) {}

  afterInit(_server: Server) {}

  handleConnection(client: Socket) {
    const initDataRaw = client.handshake.auth?.initDataRaw as string | undefined;
    const token = process.env.TELEGRAM_BOT_TOKEN || '';
    if (!initDataRaw || !verifyInitData(initDataRaw, token).ok) {
      client.disconnect(true);
      return;
    }
  }

  @SubscribeMessage('rooms:create')
  async onRoomsCreate(client: Socket) {
    const roomId = crypto.randomUUID();
    await this.redis.client.hset(`room:${roomId}:meta`, { createdAt: String(Date.now()) });
    client.emit('room:state', { roomId, players: [], createdAt: Date.now() });
  }

  @SubscribeMessage('rooms:join')
  async onRoomsJoin(client: Socket, @MessageBody() payload: unknown) {
    const parsed = ZRoomsJoinReq.safeParse(payload);
    if (!parsed.success) return;
    const { roomId } = parsed.data;
    await client.join(roomId);
    const userJson = client.handshake.auth?.user as string | undefined;
    const user = userJson ? (JSON.parse(userJson) as { id: number; first_name: string }) : null;
    const player = user ? { id: user.id, name: user.first_name } : { id: 0, name: 'Anon' };
    await this.redis.client.sadd(`room:${roomId}:players`, JSON.stringify(player));
    const all = await this.redis.client.smembers(`room:${roomId}:players`);
    const players = all.map((p) => JSON.parse(p) as { id: number; name: string });
    this.server.to(roomId).emit('room:state', { roomId, players, createdAt: Date.now() });
  }

  @SubscribeMessage('ping')
  onPing(client: Socket) {
    client.emit('pong');
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


