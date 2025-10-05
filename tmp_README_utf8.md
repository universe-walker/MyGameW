# MyGame Monorepo

РРіСЂРѕРІРѕРµ РїСЂРёР»РѕР¶РµРЅРёРµ СЃ С„СЂРѕРЅС‚РµРЅРґРѕРј (React + Vite), Р±СЌРєРµРЅРґРѕРј (NestJS + Socket.IO), РѕР±С‰РµР№ С‚РёРїРёР·Р°С†РёРµР№ РєРѕРЅС‚СЂР°РєС‚РѕРІ (Zod) Рё С…СЂР°РЅРёР»РёС‰Р°РјРё (PostgreSQL + Redis). Р РµРїРѕР·РёС‚РѕСЂРёР№ РѕСЂРіР°РЅРёР·РѕРІР°РЅ РєР°Рє pnpm workspaces РјРѕРЅРѕСЂРµРїРѕ.

## РЎС‚РµРє
- Frontend: React 18, Vite 5, Tailwind, Zustand, React Query, Vitest
- Backend: NestJS 10 (REST + WebSockets), Socket.IO, Prisma, Zod, Vitest
- DB/Cache: PostgreSQL, Redis (Docker Compose РґР»СЏ Р»РѕРєР°Р»СЊРЅРѕР№ СЂР°Р·СЂР°Р±РѕС‚РєРё)
- Shared: `packages/shared` вЂ” Zod-СЃС…РµРјС‹ Рё С‚РёРїС‹ СЃРѕР±С‹С‚РёР№ WS/HTTP

## Р‘С‹СЃС‚СЂС‹Р№ СЃС‚Р°СЂС‚ (Dev)
1) РўСЂРµР±РѕРІР°РЅРёСЏ: Node 18+, pnpm 9+, Docker (РґР»СЏ Postgres/Redis)
2) РЈСЃС‚Р°РЅРѕРІРєР° Р·Р°РІРёСЃРёРјРѕСЃС‚РµР№:
   ```bash
   pnpm i
   ```
3) РџРѕРґРЅСЏС‚СЊ Р‘Р” Рё Redis (Docker):
   ```bash
   docker-compose up -d
   ```
4) РќР°СЃС‚СЂРѕРёС‚СЊ РїРµСЂРµРјРµРЅРЅС‹Рµ РѕРєСЂСѓР¶РµРЅРёСЏ:
   - API (`apps/api/.env`):
     ```env
     PORT=4000
     DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mygame
     REDIS_URL=redis://localhost:6379
     # РџСЂРѕРґ: РѕР±СЏР·Р°С‚РµР»РµРЅ вЂ” С‚РѕРєРµРЅ Р±РѕС‚Р° Telegram РґР»СЏ РІР°Р»РёРґР°С†РёРё initData
     TELEGRAM_BOT_TOKEN=
     # Dev-СЂРµР¶РёРј: РїРѕР·РІРѕР»РёС‚СЊ СЂР°Р±РѕС‚Сѓ Р±РµР· Telegram initData
     ALLOW_DEV_NO_TG=1
     ```
  - Web (`apps/web/.env`):
    ```env
    VITE_API_BASE_URL=http://localhost:4000
    VITE_API_PATH_PREFIX=
    # Р’РєР»СЋС‡РёС‚СЊ РІСЃС‚СЂРѕРµРЅРЅСѓСЋ РєРѕРЅСЃРѕР»СЊ Р»РѕРіРѕРІ РІ UI
    VITE_DEBUG_CONSOLE=true
    # РќР°С‡Р°Р»СЊРЅРѕРµ РєРѕР»РёС‡РµСЃС‚РІРѕ РїРѕРґСЃРєР°Р·РѕРє (С‚РѕР»СЊРєРѕ РґР»СЏ С‚РµСЃС‚РѕРІ)
    VITE_TEST_HINTS=
    ```
5) РџСЂРёРјРµРЅРёС‚СЊ РјРёРіСЂР°С†РёРё Рё (РїРѕ РЅРµРѕР±С…РѕРґРёРјРѕСЃС‚Рё) СЃРёРґС‹ Р‘Р”:
   ```bash
   pnpm --filter @mygame/api prisma:migrate
   pnpm --filter @mygame/api exec prisma db seed   # РѕРїС†РёРѕРЅР°Р»СЊРЅРѕ
   ```
6) Р—Р°РїСѓСЃС‚РёС‚СЊ dev-СЃРµСЂРІРµСЂР° (С„СЂРѕРЅС‚ Рё Р±СЌРє РїР°СЂР°Р»Р»РµР»СЊРЅРѕ):
   ```bash
   pnpm -r dev
   ```
   - API: http://localhost:4000
   - Web: http://localhost:5174

## РђСѓС‚РµРЅС‚РёС„РёРєР°С†РёСЏ С‡РµСЂРµР· Telegram (REST + WS)
- REST-СЌРЅРґРїРѕРёРЅС‚С‹ `/rooms`, `/rooms/solo`, `/profile` Р·Р°С‰РёС‰РµРЅС‹ guard'РѕРј Рё С‚СЂРµР±СѓСЋС‚ Р·Р°РіРѕР»РѕРІРѕРє `X-Telegram-Init-Data`.
  - Р’ РїСЂРѕРґРµ initData РґРѕР»Р¶РµРЅ РІР°Р»РёРґРёСЂРѕРІР°С‚СЊСЃСЏ РїРѕ `TELEGRAM_BOT_TOKEN`.
  - Р’ dev Р°РЅРѕРЅРёРјРЅС‹Р№ РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ `id=0` РґРѕРїСѓСЃС‚РёРј С‚РѕР»СЊРєРѕ РїСЂРё СЏРІРЅРѕРј `ALLOW_DEV_NO_TG=1` (С‚РѕР»СЊРєРѕ РІРЅРµ production).
- РљР»РёРµРЅС‚ (web) РґРѕР±Р°РІР»СЏРµС‚ Р·Р°РіРѕР»РѕРІРѕРє Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё РІ `fetchApi`.
- WebSocket РїРѕРґРєР»СЋС‡РµРЅРёРµ РёСЃРїРѕР»СЊР·СѓРµС‚ `auth.initDataRaw` Рё С‚Р°РєР¶Рµ РІР°Р»РёРґРёСЂСѓРµС‚СЃСЏ РЅР° СЃРµСЂРІРµСЂРµ.

РџСЂРёРјРµСЂ curl (dev, Р±РµР· СЂРµР°Р»СЊРЅРѕРіРѕ С‚РѕРєРµРЅР° РґРѕРїСѓСЃС‚РёРјРѕ, РµСЃР»Рё РІРєР»СЋС‡С‘РЅ `ALLOW_DEV_NO_TG`):
```bash
curl -H "X-Telegram-Init-Data: <raw_query_string_from_telegram>" http://localhost:4000/profile
```

## РџРµСЂРµРјРµРЅРЅС‹Рµ РѕРєСЂСѓР¶РµРЅРёСЏ (РѕСЃРЅРѕРІРЅС‹Рµ)
- API (`apps/api/.env`):
  - `PORT` вЂ” РїРѕСЂС‚ API (РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ 4000)
  - `DATABASE_URL` вЂ” СЃС‚СЂРѕРєР° РїРѕРґРєР»СЋС‡РµРЅРёСЏ Рє PostgreSQL
  - `REDIS_URL` вЂ” СЃС‚СЂРѕРєР° РїРѕРґРєР»СЋС‡РµРЅРёСЏ Рє Redis
  - `TELEGRAM_BOT_TOKEN` вЂ” С‚РѕРєРµРЅ Р±РѕС‚Р° (РѕР±СЏР·Р°С‚РµР»РµРЅ; РїСЂРё РѕС‚СЃСѓС‚СЃС‚РІРёРё REST/WS РѕС‚РєР»РѕРЅСЏСЋС‚ Р·Р°РїСЂРѕСЃС‹)
  - `ALLOW_DEV_NO_TG` вЂ” `1` СЂР°Р·СЂРµС€Р°РµС‚ РґРѕСЃС‚СѓРї Р±РµР· Telegram initData РІ dev; РёРіРЅРѕСЂРёСЂСѓРµС‚СЃСЏ РІ production
  - РџР°СЂР°РјРµС‚СЂС‹ РґРІРёР¶РєР° (РѕРїС†РёРѕРЅР°Р»СЊРЅРѕ): `PREPARE_HUMAN_MS`, `PREPARE_BOT_MIN_MS`, `PREPARE_BOT_MAX_MS`, `ANSWER_WAIT_HUMAN_MS`, `ANSWER_WAIT_BOT_MS`, `SCORE_APPLY_MS`, `REVEAL_MS`, `SUPER_WAIT_MS`, `BLITZ_*`, `SOLO_DEFAULT_BOTS` Рё С‚.Рґ. (СЃРј. `apps/api/src/services/bot-engine.service.ts`).
- Web (`apps/web/.env`):
  - `VITE_API_BASE_URL` вЂ” Р±Р°Р·РѕРІС‹Р№ URL API
  - `VITE_API_PATH_PREFIX` вЂ” РїСЂРµС„РёРєСЃ (РµСЃР»Рё API Р·Р° СЂРµРІРµСЂСЃ-РїСЂРѕРєСЃРё, РЅР°РїСЂРёРјРµСЂ `/api`)
  - `VITE_DEBUG_CONSOLE` вЂ” РІРєР»СЋС‡Р°РµС‚ РІСЃС‚СЂРѕРµРЅРЅСѓСЋ РєРѕРЅСЃРѕР»СЊ Р»РѕРіРѕРІ
  - `VITE_TEST_HINTS` вЂ” РЅР°С‡Р°Р»СЊРЅРѕРµ РєРѕР»РёС‡РµСЃС‚РІРѕ РїРѕРґСЃРєР°Р·РѕРє РґР»СЏ С‚РµСЃС‚РѕРІ
  - Р”Р»СЏ dev С‡РµСЂРµР· ngrok HMR: `NGROK_HOST` (СЃРј. `apps/web/vite.config.ts`)

## РљРѕРјР°РЅРґС‹
- РЈСЃС‚Р°РЅРѕРІРєР°: `pnpm i`
- Dev: `pnpm -r dev`
- РЎР±РѕСЂРєР°: `pnpm -r build`
- РўРµСЃС‚С‹: `pnpm -r test`
- Р›РёРЅС‚/С„РѕСЂРјР°С‚: `pnpm -r lint`, `pnpm -r format`
- РњРёРіСЂР°С†РёРё: `pnpm --filter @mygame/api prisma:migrate`
- Seed: `pnpm --filter @mygame/api exec prisma db seed`

## РЎС‚СЂСѓРєС‚СѓСЂР°
- `apps/web` вЂ” С„СЂРѕРЅС‚РµРЅРґ (Vite/React)
- `apps/api` вЂ” Р±СЌРєРµРЅРґ (NestJS)
- `apps/bot` вЂ” (РѕРїС†РёРѕРЅР°Р»СЊРЅРѕРµ РїСЂРёР»РѕР¶РµРЅРёРµ-Р±РѕС‚)
- `packages/shared` вЂ” РѕР±С‰РёРµ zod-РєРѕРЅС‚СЂР°РєС‚С‹/С‚РёРїС‹

## РџРѕР»РµР·РЅС‹Рµ СЌРЅРґРїРѕРёРЅС‚С‹
- `GET /healthz` вЂ” РїСЂРѕРІРµСЂРєР° Р·РґРѕСЂРѕРІСЊСЏ API
- `POST /auth/telegram/verify` вЂ” СЃРµСЂРІРµСЂРЅР°СЏ РїСЂРѕРІРµСЂРєР° Telegram initData
- `POST /rooms` вЂ” СЃРѕР·РґР°С‚СЊ РєРѕРјРЅР°С‚Сѓ
- `POST /rooms/solo` вЂ” СЃРѕР·РґР°С‚СЊ solo-РєРѕРјРЅР°С‚Сѓ
- `GET /profile` вЂ” РїСЂРѕС„РёР»СЊ Р°РІС‚РѕСЂРёР·РѕРІР°РЅРЅРѕРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ

> РџСЂРёРјРµС‡Р°РЅРёРµ: `/rooms`, `/rooms/solo`, `/profile` С‚СЂРµР±СѓСЋС‚ Р·Р°РіРѕР»РѕРІРѕРє `X-Telegram-Init-Data` (РєСЂРѕРјРµ dev-СЂРµР¶РёРјР° РїСЂРё СЏРІРЅРѕ РІРєР»СЋС‡С‘РЅРЅРѕРј `ALLOW_DEV_NO_TG`).

## Р—Р°РјРµС‡Р°РЅРёСЏ РїРѕ РїСЂРѕРґР°РєС€РµРЅСѓ
- РћРіСЂР°РЅРёС‡СЊС‚Рµ CORS/WS origin РґР»СЏ Р±РѕРµРІРѕР№ СЃСЂРµРґС‹ (СЃРµР№С‡Р°СЃ РІ РєРѕРґРµ СЂР°Р·СЂРµС€С‘РЅ `origin: true`).
- РќР°СЃС‚СЂРѕР№С‚Рµ Р»РѕРіРёСЂРѕРІР°РЅРёРµ (pino/winston) Рё Р±Р°Р·РѕРІС‹Рµ РјРµС‚СЂРёРєРё (РєРѕР»-РІРѕ РєРѕРјРЅР°С‚, РѕС€РёР±РєРё РґРІРёР¶РєР°).
- РќРµ РІРєР»СЋС‡Р°Р№С‚Рµ РѕС‚Р»Р°РґРѕС‡РЅСѓСЋ РєРѕРЅСЃРѕР»СЊ РІ РїСЂРѕРґ (`VITE_DEBUG_CONSOLE=false`).

## РўРµСЃС‚С‹
- Backend: `pnpm --filter @mygame/api test` вЂ” СЃРѕРґРµСЂР¶РёС‚ unit Рё e2e (Vitest)
- Frontend: `pnpm --filter @mygame/web test`

## Р§Р°СЃС‚С‹Рµ РїСЂРѕР±Р»РµРјС‹
- РќРµС‚ `TELEGRAM_BOT_TOKEN` в†’ REST/WS РѕС‚РєР»РѕРЅСЏСЋС‚ Р·Р°РїСЂРѕСЃС‹. РџРµСЂРµРјРµРЅРЅР°СЏ `ALLOW_DEV_NO_TG` РІ production РёРіРЅРѕСЂРёСЂСѓРµС‚СЃСЏ.
- HMR С‡РµСЂРµР· ngrok: РѕР±РЅРѕРІРёС‚Рµ `NGROK_HOST` РІ РѕРєСЂСѓР¶РµРЅРёРё (СЃРј. `apps/web/vite.config.ts`).
- Р‘РѕР»СЊС€РёРµ СЃРёРґС‹: Р·Р°РїСѓСЃРє `prisma db seed` РјРѕР¶РµС‚ Р·Р°РЅСЏС‚СЊ РІСЂРµРјСЏ; СѓР±РµРґРёС‚РµСЃСЊ, С‡С‚Рѕ `DATABASE_URL` РІР°Р»РёРґРµРЅ Рё Р‘Р” РґРѕСЃС‚СѓРїРЅР°.

---
РћР±РЅРѕРІР»РµРЅРёСЏ РїРѕ Р°СѓС‚РµРЅС‚РёС„РёРєР°С†РёРё REST (СЃРµРЅС‚СЏР±СЂСЊ 2025):
- Р”РѕР±Р°РІР»РµРЅ guard РґР»СЏ REST `telegram-auth.guard.ts`, С‚СЂРµР±СѓСЋС‰РёР№ `X-Telegram-Init-Data`.
- РљР»РёРµРЅС‚ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё РґРѕР±Р°РІР»СЏРµС‚ Р·Р°РіРѕР»РѕРІРѕРє РІ `fetchApi`.
- РљРѕРЅС‚СЂРѕР»Р»РµСЂС‹ `/rooms` Рё `/profile` Р·Р°С‰РёС‰РµРЅС‹ guardвЂ™РѕРј.
