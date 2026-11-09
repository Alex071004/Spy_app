import { buildApp } from "./app";
import { createConnectors } from "./layers";

try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  // .env необязателен: переменные могут прийти из окружения
}

const connectors = createConnectors(process.env);
const app = await buildApp({
  connectors,
  ...(process.env.WEB_ORIGIN ? { webOrigin: process.env.WEB_ORIGIN } : {}),
  ...(process.env.LOG_LEVEL ? { logLevel: process.env.LOG_LEVEL } : {}),
});

if (connectors.length === 0) {
  app.log.warn(
    "No data sources enabled. Set SIMULATE=1 in .env for simulated aircraft and vessels",
  );
}

await app.listen({ port: Number(process.env.API_PORT ?? 4000), host: "0.0.0.0" });
