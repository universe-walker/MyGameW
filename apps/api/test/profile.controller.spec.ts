import 'reflect-metadata';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
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

describe('ProfileController (HTTP)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [{ provide: PrismaService, useClass: PrismaServiceMock }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /profile returns profile data', async () => {
    const res = await request(app.getHttpServer()).get('/profile').query({ userId: 1 });
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: 1, username: 'tester', first_name: 'Test' });
    expect(res.body.profileScore).toBe(42);
    expect(res.body.hintAllowance).toBe(3);
    expect(Array.isArray(res.body.achievements)).toBe(true);
  });

  it('GET /profile 404 for unknown user', async () => {
    const res = await request(app.getHttpServer()).get('/profile').query({ userId: 999 });
    expect([400, 404]).toContain(res.status);
  });
});
