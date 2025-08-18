import { Body, Controller, Post } from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { RedisService } from '../services/redis.service';
import { ZRoomsCreateRes } from '@mygame/shared';
import { randomUUID } from 'crypto';

@Controller('rooms')
export class RoomsController {
  constructor(private prisma: PrismaService, private redis: RedisService) {}

  @Post()
  async create() {
    const id = randomUUID();
    await this.prisma.room.create({ data: { id } });
    const now = Date.now();
    await this.redis.client.hset(`room:${id}:meta`, { createdAt: String(now) });
    return ZRoomsCreateRes.parse({ roomId: id });
  }
}


