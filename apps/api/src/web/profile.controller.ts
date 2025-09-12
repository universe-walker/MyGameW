import { Controller, Get, HttpException, HttpStatus, Query, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { ZProfileRes } from '@mygame/shared';
import { TelegramAuthGuard } from './telegram-auth.guard';

@UseGuards(TelegramAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async getProfile(@Query('userId') userIdStr: string | undefined, @Req() req?: any) {
    // Prefer authenticated user from guard, fallback to explicit query param for legacy/test paths
    const authUserId = Number(req?.user?.id);
    const userId = Number.isInteger(authUserId) && authUserId > 0 ? authUserId : userIdStr ? Number(userIdStr) : NaN;
    if (!Number.isInteger(userId)) throw new HttpException('userId required', HttpStatus.BAD_REQUEST);
    const user = await this.prisma.user.findUnique({ where: { id: BigInt(userId) } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    const meta = await this.prisma.userMeta.findUnique({ where: { userId: BigInt(userId) } });

    // TODO: compute from game results; for now read profileScore from meta
    const profileScore = meta?.profileScore ?? 0;

    let hintAllowance = meta?.hintAllowance ?? 0;
    const testHints = process.env.TEST_HINTS;
    if (testHints !== undefined) {
      const parsedHints = Number(testHints);
      if (!Number.isInteger(parsedHints) || parsedHints < 0)
        throw new HttpException('Invalid TEST_HINTS value', HttpStatus.BAD_REQUEST);
      hintAllowance = parsedHints;
    }

    // TODO: fetch real achievements; placeholder empty list
    const achievements: Array<{ code: string; title: string; progress: number }> = [];

    return ZProfileRes.parse({
      user: { id: Number(user.id), username: user.username ?? null, first_name: user.firstName },
      profileScore,
      hintAllowance,
      achievements,
    });
  }
}
