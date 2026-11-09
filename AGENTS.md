# SpyApp: правила для агентов

Этот файл читают все участники-агенты (Codex, Claude). Общение и документация на русском, код и идентификаторы на английском.

Проект: 3D-глобус с live-данными (самолёты, суда, спутники, трафик, снимки), лентой аномалий «Разведсводка» и игровым слоем «Операции». Владелец продукта: Alex (решает, что делаем и что нравится, мержит PR).

## Команда и зоны

| Кто        | Зона                                                  | Владеет файлами                                                                                                                                                                                                                                                                                                           |
| ---------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude** | Бэкенд, данные, контракты, сборка, CI, инфраструктура | `apps/api/**`, `packages/shared/**`, `packages/game/**`, `infra/**`, `.github/**`, `scripts/**`, корневые конфиги (`package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`), `docs/04-architecture.md`, `docs/05-data-sources.md`, `docs/api/**`, `docs/adr/**` |
| **Codex**  | UI/UX, дизайн, фронтенд                               | `apps/web/**`, `packages/ui/**`, `docs/07-design.md`, `docs/design/**`                                                                                                                                                                                                                                                    |
| **Alex**   | Продукт, приоритеты, ревью, мерж                      | `docs/01…03`, `docs/06`, `docs/08`, `docs/09`, `docs/backlog/**` (агенты обновляют статусы своих задач)                                                                                                                                                                                                                   |

**Правило зон:** меняешь только свои файлы. Нужна правка в чужой зоне → запись в разделе «Запросы» текущего спринта (`docs/backlog/sprint-NN.md`), и владелец зоны делает её сам. Исключение: `pnpm-lock.yaml` и `package.json` своего пакета, они меняются вместе с зависимостями.

Подробный процесс: [docs/team/README.md](docs/team/README.md).

## Контракт фронт ↔ бэк

- Единственный источник правды: **Zod-схемы в `packages/shared`** (`model.ts`, `protocol.ts`, `api.ts`). Описание словами: [docs/api/README.md](docs/api/README.md).
- Фронтенд импортирует типы и схемы только из `@spyapp/shared` и не дублирует их у себя.
- Изменение контракта делает Claude отдельным PR с префиксом `feat(shared)` / `fix(shared)`. Ломающее изменение повышает `PROTOCOL_VERSION`.

## Архитектура (кратко)

- Монорепо pnpm + Turborepo. `apps/*` → `packages/*`, никогда наоборот. `packages/ui` и `packages/game` зависят только от `packages/shared`.
- Lean-старт (ADR-0004): до фазы 4 нет БД, Redis и Docker. Состояние живёт в памяти процесса `apps/api`.
- Новый слой данных = `packages/shared/src/layers/<id>.ts` + `apps/api/src/layers/<id>/` + `apps/web/src/layers/<id>/`.
- Live-объекты на глобусе рендерятся примитивами Cesium **мимо React-стейта** (ADR-0002).
- Подробно: `docs/04-architecture.md`, решения в `docs/adr/`.

## Общие правила

- TypeScript strict везде, без `any` без комментария-причины.
- Ключи внешних API живут только в `apps/api`. В `VITE_*` попадает только то, что безопасно показать в браузере.
- Новый источник данных подключается через чек-лист в `docs/05-data-sources.md`. Сайты (FR24, MarineTraffic и т. п.) не парсим.
- Этика: никаких фич для слежки за частными людьми (`docs/08-legal-ethics.md`).
- UI-тексты идут через i18n (ru/en). Цвета и размеры берутся только из токенов `packages/ui`.
- Перед новой задачей сверяйся с `docs/03-roadmap.md` и текущим `docs/backlog/sprint-NN.md`.

## Git

- `main` защищён: только через PR, CI зелёный, мерж делает Alex (squash).
- Ветки: `claude/<кратко>` и `codex/<кратко>`, например `claude/api-world-state`, `codex/web-layer-panel`.
- Коммиты и заголовки PR в формате Conventional Commits со scope зоны: `feat(api): ...`, `feat(web): ...`, `fix(ui): ...`, `chore(build): ...`, `docs(team): ...`.
- Один PR = одна задача из спринта. Ссылайся на неё в описании.

## Команды

```bash
pnpm install
pnpm dev                 # web (:5173) + api (:4000)
pnpm --filter @spyapp/web dev
pnpm --filter @spyapp/api dev
pnpm check               # format:check + lint + typecheck + test: то же, что в CI
```

Перед PR `pnpm check` должен проходить локально.
