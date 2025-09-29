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
}
