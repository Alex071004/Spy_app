# @spyapp/ui

Дизайн-система «Ситуационного центра»: [правила и палитра](../../docs/07-design.md).

- `src/tokens.css` — цвета, типографика, размеры, поверхности и движение, включая mobile и reduced motion.
- `src/theme.css` — связь с Tailwind v4 и общие стили HUD.
- `Panel`, `IconButton`, `LayerToggle`, `DataRow`, `Kbd`, `ObjectCard`, `Reticle` — переиспользуемые React-компоненты.

Импортировать компоненты из `@spyapp/ui`, тему — из `@spyapp/ui/theme.css` после Tailwind. Приложение подключает локальные Inter Variable и JetBrains Mono. Строки передаются компонентам из i18n приложения.

Первое применение: [макет F1](../../docs/design/f1-interface.md).
