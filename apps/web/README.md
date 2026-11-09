# @spyapp/web — фронтенд

3D-глобус и интерфейс: слои, HUD, карточки, разведсводка, команды и игра.

**Текущий стек:** Vite · React 19 · TypeScript · CesiumJS · Tailwind CSS v4 · Zustand · i18next.

## Структура

- `engine/` — GlobeEngine, LiveClient, преобразование камеры в viewport.
- `layers/aircraft/` — примитивы самолётов, интерполяция и демопоток из общих фикстур.
- `features/hud/` — панели, телеметрия и статус источника.
- `store/` — состояние интерфейса; без массивов live-объектов.
- `i18n/` — RU/EN.

## Запуск

`pnpm --filter @spyapp/web dev`, открыть `http://localhost:5173`.

Переменные берутся из корневого `.env`: `VITE_API_URL`, `VITE_WS_URL`, `VITE_CESIUM_ION_TOKEN`. Без ion работают локальные изображения NASA. Без потока от API движутся три вымышленные фикстуры, HUD помечает деморежим. После первого snapshot данные сервера заменяют фикстуры.

Проверки: `pnpm --filter @spyapp/web test`, `typecheck`, `lint`, `build`. Для тестов используется отдельный `vitest.config.ts`, без копирования ассетов Cesium и запуска Vite UI-плагинов.

## Производительность

Live-объекты **не проходят через React-стейт**. LiveClient передаёт проверенные сообщения в слой, который обновляет BillboardCollection. React рендерит панели и статус. См. [ADR-0002](../../docs/adr/0002-cesium-globe.md).

[Макет F1](../../docs/design/f1-interface.md) · [Реализация и проверки F2](../../docs/design/f2-live-aircraft.md).
