import type { Connector } from "../core/connector";
import { createAdsbLolConnector } from "./aircraft/connectors/adsb-lol";
import { createOpenSkyConnector } from "./aircraft/connectors/opensky";
import { createAircraftSimulator } from "./aircraft/connectors/simulator";
import { createAdsbLolPrivacyList } from "./aircraft/privacy";
import { createVesselSimulator } from "./vessels/connectors/simulator";

/**
 * Какие источники live-слоёв запускать.
 * SIMULATE=1: самолёты и суда фейковые (внешние API для потоков не нужны).
 * Иначе реальные: OpenSky (весь мир раз в 90 с с аккаунтом / 15 мин без) + adsb.lol
 * (свежие данные там, куда смотрят клиенты). Суда появятся с aisstream (фаза 2).
 * OFFLINE=1 без SIMULATE: реальных источников нет, поток пустой.
 */
export function createConnectors(env: NodeJS.ProcessEnv): Connector[] {
  if (env.SIMULATE === "1") {
    return [
      createAircraftSimulator({ count: Number(env.SIM_AIRCRAFT ?? 10_000) }),
      createVesselSimulator({ count: Number(env.SIM_VESSELS ?? 5_000) }),
    ];
  }
  if (env.OFFLINE === "1") return [];
  return [
    createOpenSkyConnector({
      clientId: env.OPENSKY_CLIENT_ID || undefined,
      clientSecret: env.OPENSKY_CLIENT_SECRET || undefined,
      privacy: createAdsbLolPrivacyList(),
    }),
    createAdsbLolConnector({
      ...(env.ADSBLOL_RPS ? { requestsPerSecond: Number(env.ADSBLOL_RPS) } : {}),
    }),
  ];
}
