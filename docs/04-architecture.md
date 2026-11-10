# 04 · Архитектура

## Главная идея: всё строится из слоёв

Самолёты, суда, спутники и землетрясения устроены одинаково: **источник → нормализация → состояние мира → стрим клиенту → отрисовка → карточка**. Поэтому основной единицей кода является **слой** (layer module). Новый слой добавляется тремя папками, без изменений ядра.

```
packages/shared/src/layers/aircraft.ts    схема данных слоя (Zod) + метаданные
apps/api/src/layers/aircraft/             коннекторы источников + детекторы аномалий
apps/web/src/layers/aircraft/             рендерер Cesium + карточка + фильтры + переводы
```

## Схема системы (этап A, фазы 0–3)

```
 внешние API ──► ┌──────────────── apps/api (один Node-процесс) ─────────────────┐
 adsb.lol        │                                                              │
 aisstream       │  connectors ──► WorldState ──► StreamHub ──► WebSocket /ws ──┼──► браузер
 CelesTrak       │  (по слоям)     (память:       (подписки     дельты 1 Гц     │
 USGS, FIRMS     │                 Map + тайлы)    по viewport)                 │
                 │                    │                                         │
                 │                    └──► detectors ──► IntelFeed (сводка) ────┤
                 │                                                              │
 Copernicus,     │  proxy (LRU-кэш, ключи) ◄── REST /api/* ◄────────────────────┼─── браузер
 TomTom, ...  ◄──┤                                                              │
                 └──────────────────────────────────────────────────────────────┘
```

- **Один процесс, состояние в памяти.** Live-данные живут секунды или минуты, база им не нужна. 30k объектов занимают десятки мегабайт.
- **Базы данных нет до фазы 4.** См. [ADR-0004](adr/0004-lean-start.md) и раздел «Эволюция».

## Сервер (`apps/api`)

| Модуль                     | Ответственность                                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `layers/<id>/connectors/*` | Опрос или подписка на внешний источник, приведение данных к `TrackedObject`                                                                                                                                  |
| `core/world-state`         | `Map<id, TrackedObject>` на каждый слой, удаление устаревших объектов (TTL по слою). Тайловый индекс и хвосты треков добавим, когда понадобятся (линейный проход по 15k объектов занимает доли миллисекунды) |
| `core/stream-hub`          | Подписки клиентов: слои + bbox + зум. Раз в секунду считает для каждого клиента upsert/remove и отправляет                                                                                                   |
| `layers/<id>/detectors/*`  | Правила аномалий над `WorldState` (сквок 7700, AIS молчит > N ч, M6+) → события в `IntelFeed`                                                                                                                |
| `core/intel-feed`          | Лента событий сводки (кольцевой буфер), стримится клиентам                                                                                                                                                   |
| `routes/*`                 | REST: `/health`, `/api/search`, `/api/objects/:id`, `/api/imagery`, `/api/tiles/*`                                                                                                                           |
| `core/proxy`               | Прокси к API с ключами: LRU-кэш, rate limit, ключи не попадают в браузер                                                                                                                                     |

Контракт коннектора:

```ts
interface Connector {
  id: string; // "adsb-lol"
  layer: LayerId;
  start(ctx: { upsert(items: TrackedObject[]): void; log: Logger }): Promise<void>;
  stop(): Promise<void>;
}
```

Контракт детектора:

```ts
interface Detector {
  id: string; // "squawk-emergency"
  layer: LayerId;
  intervalMs: number;
  run(world: WorldStateReader): IntelEvent[];
}
```

## Клиент (`apps/web`)

Два мира, которые не смешиваются:

```
┌─ ИМПЕРАТИВНЫЙ (без React) ─────────────────┐     ┌─ REACT ───────────────────────────┐
│ GlobeEngine     владеет Cesium.Viewer,     │     │ панели, карточка, сводка,         │
│                 камера, часы, пикинг       │◄───►│ командная строка, игра            │
│ LiveClient      WebSocket, переподключение │     │                                   │
│ LayerRenderer   по одному на слой, пишет   │     │ читает/пишет только Zustand       │
│                 в коллекции примитивов     │     │                                   │
└────────────────────┬───────────────────────┘     └───────────────┬───────────────────┘
                     └────────────► Zustand store ◄────────────────┘
                     activeLayers · filters · selectedId · camera · time
                                     ▲
                                     └── синхронизация с URL (ссылки на вид)
```

- 10k+ объектов обновляются каждую секунду **мимо React**: `LiveClient` → `LayerRenderer.apply(delta)` → Cesium-примитивы.
- Между обновлениями клиент **интерполирует** позицию по скорости и курсу, движение выглядит плавным при 60 FPS.
- React узнаёт только о том, что нужно UI: выбранный объект, счётчики, события сводки.
- Клик: `GlobeEngine.pick()` → `selectedId` в store → `ObjectCard` подгружает детали через `/api/objects/:id`.

Контракт слоя на клиенте:

```ts
interface ClientLayer {
  id: LayerId;
  createRenderer(engine: GlobeEngine): LayerRenderer; // примитивы Cesium
  Card: React.FC<{ object: TrackedObject }>; // карточка объекта
  Filters?: React.FC; // фильтры в панели слоёв
  icon: string; // иконка в панели
}
```

## Протокол WebSocket

```
→ { t: "sub",   layers: ["aircraft"], bbox: [w,s,e,n], z: 4 }
→ { t: "view",  bbox: [...], z: 6 }                              // камера сдвинулась
← { t: "snap",  layer: "aircraft", items: [...] }                // после подписки
← { t: "delta", layer: "aircraft", up: [...], rm: ["id", ...] }  // раз в секунду
← { t: "intel", event: {...} }                                   // событие сводки
```

Схемы сообщений описаны Zod в `packages/shared/src/protocol.ts`. Сообщения — JSON со сжатием `permessage-deflate` (в 6 раз меньше по сети, замер B5 в `docs/api/README.md`). Следующие шаги, если понадобится масштаб в сотни клиентов: (1) `props` в дельтах только при изменении, (2) общий закодированный кадр для клиентов с одинаковой областью вместо сжатия для каждого, (3) MessagePack. На мелком зуме сервер стабильно прореживает объекты по хешу id. Объект пересылается при резком изменении или раз в keyframe-интервал (самолёты 5 с, суда 30 с), между обновлениями клиент ведёт его сам (`deadReckon`).

## Стек

| Что            | Выбор                                                                   |
| -------------- | ----------------------------------------------------------------------- |
| Язык, монорепо | TypeScript strict · pnpm workspaces · Turborepo                         |
| Глобус         | CesiumJS (примитивы, не Entity API)                                     |
| UI             | React 19 · Vite · Tailwind CSS v4 · Radix UI · Zustand · TanStack Query |
| Сервер         | Fastify · @fastify/websocket · Zod                                      |
| Орбиты         | satellite.js на клиенте                                                 |
| Тесты          | Vitest                                                                  |
| БД (с фазы 4)  | PostgreSQL + PostGIS, Drizzle ORM                                       |
| Хостинг        | VPS (Hetzner и аналоги) + Caddy · Cloudflare Pages для фронта           |

## Эволюция (усложняем только по факту)

| Этап  | Когда                    | Что добавляем                                                     | Зачем                                 |
| ----- | ------------------------ | ----------------------------------------------------------------- | ------------------------------------- |
| **A** | фазы 0–3                 | Ничего: один процесс, память                                      | Скорость разработки                   |
| **B** | фаза 4                   | PostgreSQL (Docker локально)                                      | Аккаунты, прогресс, миссии, watchlist |
| **C** | после запуска, при росте | Отдельный процесс ingest + Redis pub/sub, несколько инстансов API | Масштабирование WebSocket             |
| **D** | фаза 6+                  | TimescaleDB                                                       | Replay и длинная история треков       |

Переход A → C простой: коннекторы уже изолированы, нужна только вторая точка входа `apps/api/src/ingest-worker.ts`, которая пишет в Redis вместо памяти.

## Структура репозитория

```
apps/
  web/src/
    engine/        GlobeEngine, LiveClient, интерполяция
    layers/        aircraft/ vessels/ satellites/ events/ ...  (ClientLayer)
    features/      command-bar, layer-panel, object-card, intel-feed, share-card, timeline
    game/          брифинги, Daily Intel, журнал (фаза 4)
    store/         Zustand + синхронизация с URL
    i18n/          ru, en
  api/src/
    core/          world-state, stream-hub, intel-feed, proxy
    layers/        aircraft/ vessels/ ...  (connectors, detectors)
    routes/
packages/
  shared/          LayerId, TrackedObject, схемы слоёв, протокол, гео-утилиты
  ui/              дизайн-токены (CSS-переменные, Tailwind) и HUD-компоненты
  game/            чистая логика миссий и прогрессии (фаза 4)
infra/             docker-compose (с фазы 4), деплой
docs/
```

Правило зависимостей: `apps/*` → `packages/*`, никогда наоборот. `packages/ui` и `packages/game` зависят только от `packages/shared`.
