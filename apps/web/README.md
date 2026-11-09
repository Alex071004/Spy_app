# @spyapp/web — фронтенд

3D-глобус и весь интерфейс: слои, HUD, карточки, разведсводка, командная строка, игра.

**Стек:** Vite · React 19 · TypeScript · CesiumJS · Tailwind CSS v4 · Radix UI · Zustand · TanStack Query

## Структура `src/`

```
src/
├─ engine/        GlobeEngine (Cesium.Viewer), LiveClient (WS), интерполяция
├─ layers/
│  └─ <layer-id>/ ClientLayer: рендерер примитивов, карточка, фильтры, иконка
├─ features/      command-bar, layer-panel, object-card, intel-feed, share-card, timeline
├─ game/          UI игрового слоя (фаза 4)
├─ store/         Zustand + синхронизация с URL
└─ i18n/          ru, en
```

## Правило производительности

Live-данные **не проходят через React-стейт**. `LiveClient` передаёт дельты в `LayerRenderer`, тот пишет в коллекции примитивов Cesium. React рендерит только панели и выбранный объект. См. [04-architecture.md](../../docs/04-architecture.md#клиент-appsweb).
