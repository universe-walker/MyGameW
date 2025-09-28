import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ZRoomsCreateRes } from '@mygame/shared';
import { RoomsService } from '../services/rooms.service';
import { BotSecretGuard } from './bot-secret.guard';

@UseGuards(BotSecretGuard)
@Controller('bot/rooms')
export class BotRoomsController {
  constructor(private roomsService: RoomsService) {}

  @Post()
  async create(@Body() body?: any) {
    const minHumans = Number.isFinite(Number(body?.minHumans)) ? Number(body.minHumans) : undefined;
    const autoBots = Number.isFinite(Number(body?.autoBots)) ? Number(body.autoBots) : undefined;
    const roomId = await this.roomsService.createRoom({ minHumans, autoBots });
    return ZRoomsCreateRes.parse({ roomId });
  }

  @Post('solo')
  async createSolo() {
    const roomId = await this.roomsService.createSoloRoom();
    return ZRoomsCreateRes.parse({ roomId });
  }
}