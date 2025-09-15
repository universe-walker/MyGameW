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
import {
  ZRoomsJoinReq,
  ZRoomsLeaveReq,
  ZBuzzerPressReq,
  ZAnswerSubmitReq,
  ZBoardPickReq,
  ZSoloPauseReq,
  ZSoloResumeReq,
} from '@mygame/shared';
import type { TRoomPlayer } from '@mygame/shared';
import { z } from 'zod';
import crypto from 'crypto';
import { BotEngineService } from '../services/bot-engine.service';
import { parseInitData, verifyInitData } from '../services/telegram-auth.util';

@WebSocketGateway({ namespace: '/game', cors: { origin: true, credentials: true } })
export class GameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(private redis: RedisService, private engine: BotEngineService) {}

  afterInit(server: Server) {
    if (this.engine && typeof (this.engine as any).setServer === 'function') {
      this.engine.setServer(server);
    }
  }

  handleConnection(client: Socket) {
    const initDataRaw = client.handshake.auth?.initDataRaw as string | undefined;
    const token = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TELEGRAM_BOT_TOKEN || '';
    const allowDev = process.env.ALLOW_DEV_NO_TG === '1' || !token;
    if (!initDataRaw || !verifyInitData(initDataRaw, token).ok) {
      if (!allowDev) {
        client.disconnect(true);
        return;
      }
      // In development, allow connection without Telegram auth
    }
    // When Telegram initData is valid (or dev override enabled), parse and store
    // the authenticated user on the socket. Never trust client-provided auth.user.
    try {
      if (initDataRaw && verifyInitData(initDataRaw, token).ok) {
        const data = parseInitData(initDataRaw);
        const userJson = data.user ? decodeURIComponent(data.user) : null;
        if (userJson) {
          const user = JSON.parse(userJson) as { id: number; username?: string; first_name?: string };
          (client as any).data = (client as any).data || {};
          (client as any).data.user = { id: user.id, username: user.username, first_name: user.first_name };
        }
      }
    } catch {
      // ignore parse errors, socket remains unauthenticated user (treated as anon in dev)
    }
  }

  @SubscribeMessage('rooms:create')
  async onRoomsCreate(@ConnectedSocket() client: Socket) {
    const roomId = crypto.randomUUID();
    const now = Date.now();
    await this.redis.setRoomMeta(roomId, { createdAt: now, solo: false, botCount: 0 });
    await this.redis.touchRoom(roomId);
    const state = { roomId, solo: false, players: [], createdAt: now };
    client.emit('room:state', state as any);
  }

  @SubscribeMessage('rooms:join')
  async onRoomsJoin(@ConnectedSocket() client: Socket, @MessageBody() payload: unknown) {
    const parsed = ZRoomsJoinReq.safeParse(payload);
    if (!parsed.success) {
      // eslint-disable-next-line no-console
      console.warn('[ws] invalid payload for rooms:join', payload);
      return;
    }
    const { roomId } = parsed.data;
    await client.join(roomId);
    const user = (client as any).data?.user as { id: number; first_name?: string } | undefined;
    const player: TRoomPlayer = user ? { id: user.id, name: user.first_name || 'User' } : { id: 0, name: 'Anon' };
    await this.redis.addPlayer(roomId, player);
    await this.redis.touchRoom(roomId);
    const players = await this.redis.getPlayers(roomId);
    const meta = await this.redis.getRoomMeta(roomId);
    const createdAt = meta.createdAt;
    const solo = meta.solo;
    const state = { roomId, solo, players, createdAt };
    this.server.to(roomId).emit('room:state', state as any);
    if (solo && !this.engine.isRunning(roomId)) {
      this.engine.start(roomId);
    }
    // Publish current board state to the newly joined client(s)
    await this.engine.publishBoardState(roomId);
  }

  @SubscribeMessage('rooms:leave')
  async onRoomsLeave(@ConnectedSocket() client: Socket, @MessageBody() payload: unknown) {
    const parsed = ZRoomsLeaveReq.safeParse(payload);
    if (!parsed.success) {
      // eslint-disable-next-line no-console
      console.warn('[ws] invalid payload for rooms:leave', payload);
      return;
    }
    const roomId = parsed.data.roomId;
    // Remove player by id with id-centric storage
    const user = (client as any).data?.user as { id: number; first_name?: string } | undefined;
    const playerId = user ? user.id : 0;
    await this.redis.removePlayer(roomId, playerId);
    await client.leave(roomId);
    // Emit updated room state to remaining clients
    await this.redis.touchRoom(roomId);
    const players = await this.redis.getPlayers(roomId);
    const meta = await this.redis.getRoomMeta(roomId);
    const createdAt = meta.createdAt;
    const solo = meta.solo;
    const state = { roomId, solo, players, createdAt };
    this.server.to(roomId).emit('room:state', state as any);
    // If it's a solo room and no human players remain, stop the engine
    if (solo) {
      const hasHuman = players.some((p) => !p.bot);
      if (!hasHuman && this.engine.isRunning(roomId)) {
        this.engine.stop(roomId);
      }
    }
    await this.redis.deleteRoomIfEmpty(roomId);
  }

  @SubscribeMessage('solo:pause')
  onSoloPause(@ConnectedSocket() client: Socket, @MessageBody() payload: unknown) {
    void client;
    const parsed = ZSoloPauseReq.safeParse(payload);
    if (!parsed.success) {
      // eslint-disable-next-line no-console
      console.warn('[ws] invalid payload for solo:pause', payload);
      return;
    }
    this.engine.pause(parsed.data.roomId);
  }

  @SubscribeMessage('solo:resume')
  onSoloResume(@ConnectedSocket() client: Socket, @MessageBody() payload: unknown) {
    void client;
    const parsed = ZSoloResumeReq.safeParse(payload);
    if (!parsed.success) {
      // eslint-disable-next-line no-console
      console.warn('[ws] invalid payload for solo:resume', payload);
      return;
    }
    this.engine.resume(parsed.data.roomId);
  }

  @SubscribeMessage('buzzer:press')
  onBuzzerPress(@ConnectedSocket() client: Socket, @MessageBody() payload: unknown) {
    const parsed = ZBuzzerPressReq.safeParse(payload);
    if (!parsed.success) {
      // eslint-disable-next-line no-console
      console.warn('[ws] invalid payload for buzzer:press', payload);
      return;
    }
    const user = (client as any).data?.user as { id: number } | undefined;
    const playerId = user?.id ?? 0; // allow Anon in dev to play as id 0
    this.engine.onHumanBuzzer(parsed.data.roomId, playerId);
  }

  @SubscribeMessage('answer:submit')
  onAnswerSubmit(@ConnectedSocket() client: Socket, @MessageBody() payload: unknown) {
    const parsed = ZAnswerSubmitReq.safeParse(payload);
    if (!parsed.success) {
      // eslint-disable-next-line no-console
      console.warn('[ws] invalid payload for answer:submit', payload);
      return;
    }
    const user = (client as any).data?.user as { id: number } | undefined;
    const playerId = user?.id ?? 0; // allow Anon in dev
    this.engine.onHumanAnswer(parsed.data.roomId, playerId, parsed.data.text);
  }

  @SubscribeMessage('board:pick')
  async onBoardPick(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ) {
    const parsed = ZBoardPickReq.safeParse(payload);
    if (!parsed.success) {
      // eslint-disable-next-line no-console
      console.warn('[ws] invalid payload for board:pick', payload);
      return;
    }
    const user = (client as any).data?.user as { id: number } | undefined;
    const pickerId = user?.id ?? 0;
    const { roomId, category, value } = parsed.data;
    await this.engine.onBoardPick(roomId, category, value, pickerId);
  }

  @SubscribeMessage('hint:reveal_letter')
  async onHintRevealLetter(@ConnectedSocket() client: Socket, @MessageBody() payload: unknown) {
    const ZHintRevealReqLocal = z.object({ roomId: z.string().uuid(), position: z.number().int().min(0) });
    const parsed = ZHintRevealReqLocal.safeParse(payload);
    if (!parsed.success) {
      // eslint-disable-next-line no-console
      console.warn('[ws] invalid payload for hint:reveal_letter', payload);
      return;
    }
    const { roomId, position } = parsed.data;
    const user = (client as any).data?.user as { id: number } | undefined;
    const playerId = user?.id ?? 0; // allow Anon in dev
    const res = await this.engine.attemptRevealLetter(roomId, playerId, position);
    if (res.ok) {
      this.server?.to(roomId).emit('word:reveal', { position: res.position, char: res.char } as any);
      // Also update the requester with latest mask and whether they can reveal again
      client.emit('word:mask', { mask: res.newMask, len: res.newMask.length, canReveal: res.nextCanReveal } as any);
    } else {
      client.emit('hint:error', { message: res.error } as any);
    }
  }

  @SubscribeMessage('ping')
  onPing(@ConnectedSocket() client: Socket) {
    client.emit('pong');
  }

  async handleDisconnect(client: Socket) {
    const user = (client as any).data?.user as { id: number } | undefined;
    // Remove user from all rooms they were joined to (no global SCAN/KEYS)
    const userId = user?.id ?? 0; // 0 for Anon players in dev
    const rooms = Array.from(client.rooms).filter((r) => r !== client.id);
    for (const roomId of rooms) {
      await this.redis.removePlayer(roomId, userId);
      await this.redis.touchRoom(roomId);
      const players = await this.redis.getPlayers(roomId);
      const meta = await this.redis.getRoomMeta(roomId);
      const state = { roomId, solo: meta.solo, players, createdAt: meta.createdAt };
      this.server.to(roomId).emit('room:state', state as any);
      if (state.solo) {
        const hasHuman = players.some((p: { bot?: boolean }) => !p.bot);
        if (!hasHuman && this.engine.isRunning(roomId)) {
          this.engine.stop(roomId);
        }
      }
      await this.redis.deleteRoomIfEmpty(roomId);
    }
  }
}
