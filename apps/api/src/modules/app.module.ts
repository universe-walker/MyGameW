import { Module } from '@nestjs/common';
import { AppController } from '../web/app.controller';
import { AuthController } from '../web/auth.controller';
import { RoomsController } from '../web/rooms.controller';
import { BillingController } from '../web/billing.controller';
import { ProfileController } from '../web/profile.controller';
import { GameGateway } from '../realtime/game.gateway';
import { RedisService } from '../services/redis.service';
import { PrismaService } from '../services/prisma.service';
import { TimerRegistryService } from '../services/timer-registry.service';
import { BotProfilesService } from '../services/bot-profiles.service';
import { BotEngineService } from '../services/bot-engine.service';
import { TelemetryService } from '../services/telemetry.service';

@Module({
  imports: [],
  controllers: [AppController, AuthController, RoomsController, BillingController, ProfileController],
  providers: [
    GameGateway,
    RedisService,
    PrismaService,
    TimerRegistryService,
    BotProfilesService,
    BotEngineService,
    TelemetryService,
  ],
})
export class AppModule {}


