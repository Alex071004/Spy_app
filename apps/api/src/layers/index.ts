import type { Connector } from "../core/connector";
import { createAdsbLolConnector } from "./aircraft/connectors/adsb-lol";
import { createAircraftSimulator } from "./aircraft/connectors/simulator";
import { createVesselSimulator } from "./vessels/connectors/simulator";

/**
 * Какие источники запускать.
 * SIMULATE=1: весь мир фейковый, внешние API не нужны.
 * Иначе реальные источники: самолёты из adsb.lol. Суда появятся с aisstream (фаза 2).
 */
export function createConnectors(env: NodeJS.ProcessEnv): Connector[] {
  if (env.SIMULATE === "1") {
    return [
      createAircraftSimulator({ count: Number(env.SIM_AIRCRAFT ?? 10_000) }),
      createVesselSimulator({ count: Number(env.SIM_VESSELS ?? 5_000) }),
    ];
  }
  return [
    createAdsbLolConnector({
      ...(env.ADSBLOL_RPS ? { requestsPerSecond: Number(env.ADSBLOL_RPS) } : {}),
    }),
  ];
}
