# infra

## Локально

```bash
pnpm infra:up     # Postgres + PostGIS на :5432 (нужен с фазы 4)
pnpm infra:down
```

Нужен Docker Desktop.

## Production (план, фаза 5)

- Один VPS: Docker Compose (api, postgres) + Caddy как reverse proxy с автоматическим TLS.
- `apps/web` собирается в статику и деплоится на Cloudflare Pages.
- Cloudflare перед API (DNS, WAF, кэш тайлов-прокси).
- Бэкапы Postgres раз в сутки во внешнее объектное хранилище.
