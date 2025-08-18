---
trigger: manual
---

Для react и vite (frontend) используй такую структуру файлов (это пример)
src/
  app/                    # Инициализация приложения
    providers/            # QueryClient, Theme, TWA SDK, т.п.
    router/               # Конфиг маршрутов
    App.tsx
    main.tsx              # вход (Vite)

  pages/                  # "экраны" = маршруты
    home/
      index.ts            # barrel для страницы
      HomePage.tsx
      model.ts            # хуки, local state
      widgets/            # блоки, специфичные для экрана
    profile/
      ProfilePage.tsx
      loader.ts           # префетч данных (опционально)
      guard.tsx           # защита маршрута (auth)
    not-found/NotFoundPage.tsx

  features/               # переиспользуемые сценарии (логин, фильтр, аплоад)
    auth/
      ui/LoginForm.tsx
      model/useLogin.ts
    chat/
      ui/Chat.tsx
      model/useMessages.ts
      api/messages.ts

  entities/               # «сущности» домена (User, Order…)
    user/
      ui/UserCard.tsx
      model/useUser.ts
      api/user.api.ts
      types.ts

  shared/
    ui/                   # кнопки, inputs (или шадсиен-композиции)
    api/                  # базовый axios/fetch, zod-схемы, хелперы ошибок
    lib/                  # утилиты, форматтеры, hooks
    config/               # константы, env, роуты-имена
    styles/               # globals.css, tailwind.css

Идея:

pages/* — только композиция: собирают UI из фич/сущностей и подключают данные.

features/* — «кусок поведения» с UI и логикой (можно переиспользовать на нескольких страницах).

entities/* — минимальные кирпичики домена.

shared/* — то, что не зависит от домена.
