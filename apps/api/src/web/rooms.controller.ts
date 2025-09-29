import { Body, Controller, Post, UseGuards, Req } from '@nestjs/common';
import { ZRoomsCreateRes } from '@mygame/shared';
import { RoomsService } from '../services/rooms.service';
import { TelegramAuthGuard } from './telegram-auth.guard';

@UseGuards(TelegramAuthGuard)
@Controller('rooms')
export class RoomsController {
  constructor(private roomsService: RoomsService) {}

  @Post()
  async create(@Req() req: any, @Body() body?: any) {
    const minHumans = Number.isFinite(Number(body?.minHumans)) ? Number(body.minHumans) : undefined;
    const autoBots = Number.isFinite(Number(body?.autoBots)) ? Number(body.autoBots) : undefined;
    // Matchmaking: prefer an existing waiting room; otherwise create new
    const roomId = await this.roomsService.findOrCreateRoom({ minHumans, autoBots });
    // Reserve a slot: add caller as human player immediately (prevents race with WS join)
    const u = req?.user as { id: number; first_name?: string } | undefined;
    if (u && typeof u.id === 'number') {
      await this.roomsService.addPlayerToRoom(roomId, { id: u.id, name: u.first_name || 'User' });
    }
    return ZRoomsCreateRes.parse({ roomId });
  }

  @Post('solo')
  async createSolo() {
    const roomId = await this.roomsService.createSoloRoom();
    return ZRoomsCreateRes.parse({ roomId });
  }
}
