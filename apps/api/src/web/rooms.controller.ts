import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { RedisService } from '../services/redis.service';
import { ZRoomsCreateRes } from '@mygame/shared';
import type { TRoomPlayer } from '@mygame/shared';
import { randomUUID } from 'crypto';
import { TelegramAuthGuard } from './telegram-auth.guard';

@UseGuards(TelegramAuthGuard)
@Controller('rooms')
export class RoomsController {
  constructor(private prisma: PrismaService, private redis: RedisService) {}

  @Post()
  async create(@Body() body?: any) {
    const id = randomUUID();
    try {
      await this.prisma.room.create({ data: { id } });
    } catch (e) {
      // Temporary fallback: allow Redis-only room creation when DB schema is behind (solo/botCount columns missing)
      // eslint-disable-next-line no-console
      console.warn('[rooms.create] prisma.room.create failed; continuing with Redis-only room. Error:', e);
    }
    const now = Date.now();
    const minHumans = Number.isFinite(Number(body?.minHumans)) ? Number(body.minHumans) : undefined;
    const autoBots = Number.isFinite(Number(body?.autoBots)) ? Number(body.autoBots) : undefined;
    await this.redis.setRoomMeta(id, { createdAt: now, solo: false, botCount: 0, minHumans, autoBots });
    return ZRoomsCreateRes.parse({ roomId: id });
  }

  @Post('solo')
  async createSolo() {
    const id = randomUUID();
    const botCount = Number(process.env.SOLO_DEFAULT_BOTS || '2');
    // Note: prisma Room model may not yet have solo/botCount until migration is applied.
    try {
      await this.prisma.room.create({ data: { id, solo: true, botCount } as any });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[rooms.solo] prisma.room.create failed; continuing with Redis-only room. Error:', e);
    }
    const now = Date.now();
    await this.redis.setRoomMeta(id, { createdAt: now, solo: true, botCount });
    await this.redis.touchRoom(id);
    // Seed bots into players set (IDs use negative numbers to avoid collision with real users)
    const bots: TRoomPlayer[] = Array.from({ length: botCount }).map((_, i) => ({
      id: -1 - i,
      name: `Bot #${i + 1}`,
      bot: true,
    }));
    if (bots.length) await this.redis.addPlayers(id, bots);
    await this.redis.touchRoom(id);
    return ZRoomsCreateRes.parse({ roomId: id });
  }
}


