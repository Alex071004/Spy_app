# SpyApp: заметки для Claude

Хобби-проект автора: 3D-глобус с live-данными (самолёты, суда, спутники, трафик, снимки), лентой аномалий «Разведсводка» и игровым слоем «Операции». Общение и документация на русском, код и идентификаторы на английском.

## Где что

- Концепция и планы: `docs/01…09-*.md`. **Перед новой фичей сверяйся с `docs/03-roadmap.md`** (текущая фаза), `docs/09-features.md` и `docs/backlog/sprint-NN.md`.
- Архитектура: `docs/04-architecture.md` (контракты слоя, коннектора, детектора, протокол WS). Решения: `docs/adr/`, новое крупное решение оформляй ADR по шаблону `0000-template.md`.
- Монорепо pnpm + Turborepo: `apps/web` (React + CesiumJS), `apps/api` (Fastify: коннекторы, состояние мира, стриминг), `packages/shared|ui|game`.

## Правила

- TypeScript strict везде. Общие типы, схемы слоёв и протокол лежат только в `packages/shared`.
- `apps/*` → `packages/*`, никогда наоборот.
- Новый слой = `packages/shared/src/layers/<id>.ts` + `apps/api/src/layers/<id>/` + `apps/web/src/layers/<id>/`. Ядро при этом не меняется.
- Lean-старт (ADR-0004): до фазы 4 нет БД, Redis и Docker, состояние живёт в памяти процесса `apps/api`.
- Live-объекты на глобусе рендерятся примитивами Cesium **мимо React-стейта** (ADR-0002).
- Ключи внешних API живут только в `apps/api`. В `VITE_*` попадает только то, что безопасно показать в браузере.
- Новый источник данных подключается через чек-лист в `docs/05-data-sources.md`. Сайты (FR24, MarineTraffic и т. п.) не парсим.
- Этика: никаких фич для слежки за частными людьми (`docs/08-legal-ethics.md`).
- UI-тексты идут через i18n (ru/en). Цвета и размеры берутся только из токенов `packages/ui`, без хардкода.

## Команды

```bash
pnpm dev          # web + api
pnpm lint && pnpm typecheck && pnpm test
pnpm infra:up     # Postgres, с фазы 4
```
