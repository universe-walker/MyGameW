import { Module } from '@nestjs/common';
import { AppController } from '../web/app.controller';
import { AuthController } from '../web/auth.controller';
import { RoomsController } from '../web/rooms.controller';
import { BillingController } from '../web/billing.controller';
import { ProfileController } from '../web/profile.controller';
import { GameGateway } from '../realtime/game.gateway';
import { RedisService } from '../services/redis.service';
import { PrismaService } from '../services/prisma.service';

@Module({
  imports: [],
  controllers: [AppController, AuthController, RoomsController, BillingController, ProfileController],
  providers: [GameGateway, RedisService, PrismaService],
})
export class AppModule {}


