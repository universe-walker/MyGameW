# MyGame Monorepo

Игровое приложение с фронтендом (React + Vite), бэкендом (NestJS + Socket.IO), общей типизацией контрактов (Zod) и хранилищами (PostgreSQL + Redis). Репозиторий организован как pnpm workspaces монорепо.

## Стек
- Frontend: React 18, Vite 5, Tailwind, Zustand, React Query, Vitest
- Backend: NestJS 10 (REST + WebSockets), Socket.IO, Prisma, Zod, Vitest
- DB/Cache: PostgreSQL, Redis (Docker Compose для локальной разработки)
- Shared: `packages/shared` — Zod-схемы и типы событий WS/HTTP

## Быстрый старт (Dev)
1) Требования: Node 18+, pnpm 9+, Docker (для Postgres/Redis)
2) Установка зависимостей:
   ```bash
   pnpm i
   ```
3) Поднять БД и Redis (Docker):
   ```bash
   docker-compose up -d
   ```
4) Настроить переменные окружения:
   - API (`apps/api/.env`):
     ```env
     PORT=4000
     DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mygame
     REDIS_URL=redis://localhost:6379
     # Прод: обязателен — токен бота Telegram для валидации initData
     TELEGRAM_BOT_TOKEN=
     # Dev-режим: позволить работу без Telegram initData
     ALLOW_DEV_NO_TG=1
     ```
   - Web (`apps/web/.env`):
     ```env
     VITE_API_BASE_URL=http://localhost:4000
     VITE_API_PATH_PREFIX=
     # Включить встроенную консоль логов в UI
     VITE_DEBUG_CONSOLE=true
     ```
5) Применить миграции и (по необходимости) сиды БД:
   ```bash
   pnpm --filter @mygame/api prisma:migrate
   pnpm --filter @mygame/api exec prisma db seed   # опционально
   ```
6) Запустить dev-сервера (фронт и бэк параллельно):
   ```bash
   pnpm -r dev
   ```
   - API: http://localhost:4000
   - Web: http://localhost:5174

## Аутентификация через Telegram (REST + WS)
- REST-эндпоинты `/rooms`, `/rooms/solo`, `/profile` защищены guard'ом и требуют заголовок `X-Telegram-Init-Data`.
  - В проде initData должен валидироваться по `TELEGRAM_BOT_TOKEN`.
  - В dev (`ALLOW_DEV_NO_TG=1` или если токен не задан) допускается анонимный пользователь `id=0`.
- Клиент (web) добавляет заголовок автоматически в `fetchApi`.
- WebSocket подключение использует `auth.initDataRaw` и также валидируется на сервере.

Пример curl (dev, без реального токена допустимо, если включён `ALLOW_DEV_NO_TG`):
```bash
curl -H "X-Telegram-Init-Data: <raw_query_string_from_telegram>" http://localhost:4000/profile
```

## Переменные окружения (основные)
- API (`apps/api/.env`):
  - `PORT` — порт API (по умолчанию 4000)
  - `DATABASE_URL` — строка подключения к PostgreSQL
  - `REDIS_URL` — строка подключения к Redis
  - `TELEGRAM_BOT_TOKEN` — токен бота (обязателен в прод)
  - `ALLOW_DEV_NO_TG` — `1` разрешает доступ без Telegram initData в dev
  - Параметры движка (опционально): `PREPARE_HUMAN_MS`, `PREPARE_BOT_MIN_MS`, `PREPARE_BOT_MAX_MS`, `ANSWER_WAIT_HUMAN_MS`, `ANSWER_WAIT_BOT_MS`, `SCORE_APPLY_MS`, `REVEAL_MS`, `SUPER_WAIT_MS`, `BLITZ_*`, `SOLO_DEFAULT_BOTS` и т.д. (см. `apps/api/src/services/bot-engine.service.ts`).
- Web (`apps/web/.env`):
  - `VITE_API_BASE_URL` — базовый URL API
  - `VITE_API_PATH_PREFIX` — префикс (если API за реверс-прокси, например `/api`)
  - `VITE_DEBUG_CONSOLE` — включает встроенную консоль логов
  - Для dev через ngrok HMR: `NGROK_HOST` (см. `apps/web/vite.config.ts`)

## Команды
- Установка: `pnpm i`
- Dev: `pnpm -r dev`
- Сборка: `pnpm -r build`
- Тесты: `pnpm -r test`
- Линт/формат: `pnpm -r lint`, `pnpm -r format`
- Миграции: `pnpm --filter @mygame/api prisma:migrate`
- Seed: `pnpm --filter @mygame/api exec prisma db seed`

## Структура
- `apps/web` — фронтенд (Vite/React)
- `apps/api` — бэкенд (NestJS)
- `apps/bot` — (опциональное приложение-бот)
- `packages/shared` — общие zod-контракты/типы

## Полезные эндпоинты
- `GET /healthz` — проверка здоровья API
- `POST /auth/telegram/verify` — серверная проверка Telegram initData
- `POST /rooms` — создать комнату
- `POST /rooms/solo` — создать solo-комнату
- `GET /profile` — профиль авторизованного пользователя

> Примечание: `/rooms`, `/rooms/solo`, `/profile` требуют заголовок `X-Telegram-Init-Data` (кроме dev-режима).

## Замечания по продакшену
- Ограничьте CORS/WS origin для боевой среды (сейчас в коде разрешён `origin: true`).
- Настройте логирование (pino/winston) и базовые метрики (кол-во комнат, ошибки движка).
- Не включайте отладочную консоль в прод (`VITE_DEBUG_CONSOLE=false`).

## Тесты
- Backend: `pnpm --filter @mygame/api test` — содержит unit и e2e (Vitest)
- Frontend: `pnpm --filter @mygame/web test`

## Частые проблемы
- Нет `TELEGRAM_BOT_TOKEN` в проде → REST/WS будет отклонять запросы без `ALLOW_DEV_NO_TG`.
- HMR через ngrok: обновите `NGROK_HOST` в окружении (см. `apps/web/vite.config.ts`).
- Большие сиды: запуск `prisma db seed` может занять время; убедитесь, что `DATABASE_URL` валиден и БД доступна.

---
Обновления по аутентификации REST (сентябрь 2025):
- Добавлен guard для REST `telegram-auth.guard.ts`, требующий `X-Telegram-Init-Data`.
- Клиент автоматически добавляет заголовок в `fetchApi`.
- Контроллеры `/rooms` и `/profile` защищены guard’ом.
