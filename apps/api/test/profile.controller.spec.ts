import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ProfileController } from '../src/web/profile.controller';
import { PrismaService } from '../src/services/prisma.service';

class PrismaServiceMock {
  user = {
    findUnique: async ({ where: { id } }: any) => {
      if (String(id) === String(1)) {
        return { id: BigInt(1), username: 'tester', firstName: 'Test' };
      }
      return null;
    },
  };
  userMeta = {
    findUnique: async ({ where: { userId } }: any) => {
      if (String(userId) === String(1)) {
        return { userId: BigInt(1), profileScore: 42, hintAllowance: 3 };
      }
      return null;
    },
  };
}

describe('ProfileController (unit)', () => {
  it('returns profile data for known user', async () => {
    const ctrl = new ProfileController(new PrismaServiceMock() as any as PrismaService);
    const res = await ctrl.getProfile('1');
    expect(res.user).toEqual({ id: 1, username: 'tester', first_name: 'Test' });
    expect(res.profileScore).toBe(42);
    expect(res.hintAllowance).toBe(3);
    expect(Array.isArray(res.achievements)).toBe(true);
  });

  it('throws 404 for unknown user', async () => {
    const ctrl = new ProfileController(new PrismaServiceMock() as any as PrismaService);
    await expect(ctrl.getProfile('999')).rejects.toMatchObject({ status: 404 });
  });
});
