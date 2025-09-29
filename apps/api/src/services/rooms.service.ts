import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { TRoomPlayer } from '@mygame/shared';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';

interface CreateRoomOptions {
  minHumans?: number;
  autoBots?: number;
}

@Injectable()
export class RoomsService {
  constructor(private prisma: PrismaService, private redis: RedisService) {}

  /**
   * Try to find an existing multiplayer room that is waiting for more humans.
   * If none found, create a new one. Returns the room id to join.
   */
  async findOrCreateRoom(options: CreateRoomOptions = {}): Promise<string> {
    // Determine threshold (min humans) using explicit option or env-backed default
    const allow2p = String(process.env.ALLOW_TWO_PLAYER_MULTI || '').toLowerCase();
    const allow2pBool = ['1', 'true', 'yes', 'on', 'y'].includes(allow2p);
    const defaultMinHumans = allow2pBool ? 2 : Number(process.env.DEFAULT_MIN_HUMANS || 3);
    const requestedMin = Number.isFinite(Number(options.minHumans)) && Number(options.minHumans) > 0
      ? Number(options.minHumans)
      : undefined;
    const thresholdDefault = requestedMin ?? defaultMinHumans;

    try {
      // Scan existing rooms and pick the oldest joinable multiplayer room
      const keys = await this.redis.listRoomPlayerKeys();
      let best: { roomId: string; createdAt: number } | null = null;
      for (const key of keys) {
        const roomId = this.redis.getRoomIdFromPlayersKey(key);
        if (!roomId) continue;
        // Skip rooms that look like solo
        const meta = await this.redis.getRoomMeta(roomId);
        if (meta.solo) continue;
        // Decide threshold for this specific room (its own override or default)
        const threshold = Number.isFinite(Number(meta.minHumans)) && Number(meta.minHumans) > 0
          ? Number(meta.minHumans)
          : thresholdDefault;
        // Count human players
        const players = await this.redis.getPlayersByKey(key);
        const humans = players.filter((p) => !p.bot).length;
        // Joinable if at least one human, but not full yet
        if (humans >= 1 && humans < threshold) {
          if (!best || meta.createdAt < best.createdAt) {
            best = { roomId, createdAt: meta.createdAt };
          }
        }
      }
      if (best) return best.roomId;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[rooms.findOrCreate] scanning failed, falling back to createRoom', e);
    }

    // Otherwise, create a fresh room with the requested overrides
    return this.createRoom(options);
  }

  async createRoom(options: CreateRoomOptions = {}): Promise<string> {
    const roomId = randomUUID();
    try {
      await this.prisma.room.create({ data: { id: roomId } });
    } catch (e) {
      console.warn('[rooms.create] prisma.room.create failed; continuing with Redis-only room. Error:', e);
    }

    const now = Date.now();
    await this.redis.setRoomMeta(roomId, {
      createdAt: now,
      solo: false,
      botCount: 0,
      minHumans: options.minHumans,
      autoBots: options.autoBots,
    });
    return roomId;
  }

  async createSoloRoom(): Promise<string> {
    const roomId = randomUUID();
    const botCount = Number(process.env.SOLO_DEFAULT_BOTS || '2');

    try {
      await this.prisma.room.create({ data: { id: roomId, solo: true, botCount } as any });
    } catch (e) {
      console.warn('[rooms.solo] prisma.room.create failed; continuing with Redis-only room. Error:', e);
    }

    const now = Date.now();
    await this.redis.setRoomMeta(roomId, { createdAt: now, solo: true, botCount });
    await this.redis.touchRoom(roomId);

    // Predefined pool of Russian bot names (cycled if needed)
    const botNames = [
      'Алексей',
      'Марина',
      'Иван',
      'Сергей',
      'Екатерина',
      'Ольга',
      'Павел',
      'Наталья',
      'Дмитрий',
      'Анна',
      'Михаил',
      'Виктория',
      'Ирина',
      'Кирилл',
      'Юлия',
    ];

    const bots: TRoomPlayer[] = Array.from({ length: botCount }).map((_, i) => ({
      id: -1 - i,
      name: botNames[i % botNames.length],
      bot: true,
    }));

    if (bots.length) {
      await this.redis.addPlayers(roomId, bots);
      await this.redis.touchRoom(roomId);
    }

    return roomId;
  }

  /** Add or update a human player in the room (idempotent by player id). */
  async addPlayerToRoom(roomId: string, player: TRoomPlayer): Promise<void> {
    await this.redis.addPlayer(roomId, player);
    await this.redis.touchRoom(roomId);
  }
}
