import { buildApp } from "./app";

try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  // .env необязателен: переменные могут прийти из окружения
}

const app = await buildApp({
  ...(process.env.WEB_ORIGIN ? { webOrigin: process.env.WEB_ORIGIN } : {}),
  ...(process.env.LOG_LEVEL ? { logLevel: process.env.LOG_LEVEL } : {}),
});

await app.listen({ port: Number(process.env.API_PORT ?? 4000), host: "0.0.0.0" });
