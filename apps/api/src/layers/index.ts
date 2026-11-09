import type { Connector } from "../core/connector";
import { createAircraftSimulator } from "./aircraft/connectors/simulator";
import { createVesselSimulator } from "./vessels/connectors/simulator";

/** Какие источники запускать. Реальные коннекторы появятся с B2 (adsb-lol) */
export function createConnectors(env: NodeJS.ProcessEnv): Connector[] {
  const connectors: Connector[] = [];
  if (env.SIMULATE === "1") {
    connectors.push(
      createAircraftSimulator({ count: Number(env.SIM_AIRCRAFT ?? 10_000) }),
      createVesselSimulator({ count: Number(env.SIM_VESSELS ?? 5_000) }),
    );
  }
  return connectors;
}
