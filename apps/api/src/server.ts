import { fileURLToPath } from "node:url";
import { buildApp } from "./app";
import { createConnectors } from "./layers";
import { createLocalGeocoder, createNominatimGeocoder } from "./geocode/geocoder";
import { AIRPORTS } from "./layers/aircraft/airports";
import { createPlanespottersPhotos } from "./layers/aircraft/photos";
import { createCelestrakSatellites, createFixtureSatellites } from "./layers/satellites/tle-source";

try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  // .env необязателен: переменные могут прийти из окружения
}

/**
 * SIMULATE=1 подменяет только live-потоки (самолёты, суда).
 * OFFLINE=1 отключает вообще все внешние сервисы: спутники, геокодинг и фото берутся из встроенных данных.
 */
const offline = process.env.OFFLINE === "1";
const connectors = createConnectors(process.env);
// Логгер появляется вместе с app, а источники нужны раньше: подключаем после сборки
const sourceLog: { warn(obj: object, msg: string): void } = { warn: () => {} };

const app = await buildApp({
  connectors,
  satellites: offline
    ? createFixtureSatellites()
    : createCelestrakSatellites({
        cacheDir: fileURLToPath(new URL("../.cache", import.meta.url)),
        log: sourceLog,
      }),
  geocoder: offline
    ? createLocalGeocoder(AIRPORTS)
    : createNominatimGeocoder({ fallback: createLocalGeocoder(AIRPORTS), log: sourceLog }),
  photos: offline ? { find: async () => null } : createPlanespottersPhotos(),
  wsCompression: process.env.WS_DEFLATE !== "0",
  ...(process.env.WEB_ORIGIN ? { webOrigin: process.env.WEB_ORIGIN } : {}),
  ...(process.env.LOG_LEVEL ? { logLevel: process.env.LOG_LEVEL } : {}),
});
sourceLog.warn = (obj, msg) => app.log.warn(obj, msg);

app.log.info(
  {
    streams: process.env.SIMULATE === "1" ? "simulator" : offline ? "none" : "opensky + adsb.lol",
    lookups: offline ? "offline fixtures" : "celestrak, nominatim, planespotters",
    opensky: process.env.OPENSKY_CLIENT_ID ? "account" : "anonymous",
  },
  "data sources",
);
if (connectors.length === 0) app.log.warn("No live data sources enabled");

await app.listen({ port: Number(process.env.API_PORT ?? 4000), host: "0.0.0.0" });
