import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './modules/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true, credentials: true });
  const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  if (isProd && process.env.ALLOW_DEV_NO_TG === '1') {
    // eslint-disable-next-line no-console
    console.error('ALLOW_DEV_NO_TG must not be enabled in production. Refusing to start.');
    process.exit(1);
  }
  if (!process.env.TELEGRAM_BOT_TOKEN && !process.env.BOT_TELEGRAM_BOT_TOKEN) {
    // eslint-disable-next-line no-console
    console.warn('Warning: TELEGRAM_BOT_TOKEN is not set. Requests will be rejected by auth guard and WS gateway.');
  }
  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
}

bootstrap();


