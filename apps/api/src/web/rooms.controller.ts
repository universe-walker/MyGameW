import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ZRoomsCreateRes } from '@mygame/shared';
import { RoomsService } from '../services/rooms.service';
import { TelegramAuthGuard } from './telegram-auth.guard';

@UseGuards(TelegramAuthGuard)
@Controller('rooms')
export class RoomsController {
  constructor(private roomsService: RoomsService) {}

  @Post()
  async create(@Body() body?: any) {
    const minHumans = Number.isFinite(Number(body?.minHumans)) ? Number(body.minHumans) : undefined;
    const autoBots = Number.isFinite(Number(body?.autoBots)) ? Number(body.autoBots) : undefined;
    // Matchmaking: prefer an existing waiting room; otherwise create new
    const roomId = await this.roomsService.findOrCreateRoom({ minHumans, autoBots });
    return ZRoomsCreateRes.parse({ roomId });
  }

  @Post('solo')
  async createSolo() {
    const roomId = await this.roomsService.createSoloRoom();
    return ZRoomsCreateRes.parse({ roomId });
  }
}
