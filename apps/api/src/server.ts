import { fileURLToPath } from "node:url";
import { buildApp } from "./app";
import { createConnectors } from "./layers";
import { createCelestrakSatellites, createFixtureSatellites } from "./layers/satellites/tle-source";

try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  // .env необязателен: переменные могут прийти из окружения
}

const simulate = process.env.SIMULATE === "1";
const connectors = createConnectors(process.env);
// Логгер появляется вместе с app, а источник спутников нужен раньше: подключаем после сборки
const satelliteLog: { warn(obj: object, msg: string): void } = { warn: () => {} };

const app = await buildApp({
  connectors,
  satellites: simulate
    ? createFixtureSatellites()
    : createCelestrakSatellites({
        cacheDir: fileURLToPath(new URL("../.cache", import.meta.url)),
        log: satelliteLog,
      }),
  ...(process.env.WEB_ORIGIN ? { webOrigin: process.env.WEB_ORIGIN } : {}),
  ...(process.env.LOG_LEVEL ? { logLevel: process.env.LOG_LEVEL } : {}),
});
satelliteLog.warn = (obj, msg) => app.log.warn(obj, msg);

if (connectors.length === 0) {
  app.log.warn("No data sources enabled");
}

await app.listen({ port: Number(process.env.API_PORT ?? 4000), host: "0.0.0.0" });
