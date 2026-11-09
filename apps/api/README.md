# @spyapp/api — сервер

Один Node-процесс ([ADR-0004](../../docs/adr/0004-lean-start.md)): забирает данные из источников, держит состояние мира в памяти, стримит его клиентам по viewport, находит аномалии для разведсводки и проксирует API с ключами.

**Стек:** Fastify · @fastify/websocket · Zod

## Структура `src/`

```
src/
├─ server.ts           точка входа: Fastify, регистрация слоёв и роутов
├─ core/
│  ├─ world-state/     Map по слоям + тайловый индекс + короткие хвосты
│  ├─ stream-hub/      подписки клиентов, дельты раз в секунду
│  ├─ intel-feed/      лента событий разведсводки
│  └─ proxy/           LRU-кэш и rate limit для API с ключами
├─ layers/
│  └─ <layer-id>/
│     ├─ connectors/   источники данных (adsb-lol, opensky, aisstream, ...)
│     └─ detectors/    правила аномалий (squawk-emergency, ais-dark, ...)
└─ routes/             health, search, objects, imagery, tiles
```

Контракты коннектора и детектора описаны в [04-architecture.md](../../docs/04-architecture.md#сервер-appsapi). Перед добавлением источника пройди чек-лист в [05-data-sources.md](../../docs/05-data-sources.md).
