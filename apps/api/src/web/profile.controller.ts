import { Controller, Get, HttpException, HttpStatus, Query } from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { ZProfileRes } from '@mygame/shared';

@Controller('profile')
export class ProfileController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async getProfile(@Query('userId') userIdStr?: string) {
    const userId = userIdStr ? Number(userIdStr) : NaN;
    if (!Number.isInteger(userId)) {
      throw new HttpException('userId required', HttpStatus.BAD_REQUEST);
    }
    const user = await this.prisma.user.findUnique({ where: { id: BigInt(userId) } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    const meta = await this.prisma.userMeta.findUnique({ where: { userId: BigInt(userId) } });

    // TODO: compute from game results; for now read profileScore from meta
    const profileScore = meta?.profileScore ?? 0;
    const hintAllowance = meta?.hintAllowance ?? 0;

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
