import {
  bearingDeg,
  distanceM,
  interpolateGreatCircle,
  roundPoint,
  type GeoPoint,
  type TrackedObject,
} from "@spyapp/shared";
import type { Connector } from "../../../core/connector";
import { createRandom, type Random } from "../../../core/random";
import { AIRLINES, AIRPORTS, REGISTRATION_PREFIXES, type Airport } from "./simulator-data";

interface Flight {
  hex: string;
  callsign: string;
  type: string;
  registration: string;
  squawk: string;
  from: Airport;
  to: Airport;
  distance: number;
  /** Пройденный путь по маршруту, метры */
  progress: number;
  cruiseSpeed: number;
  cruiseAlt: number;
}

export interface AircraftSimulatorOptions {
  count?: number;
  tickMs?: number;
  seed?: number;
  now?: () => number;
}

const MIN_ROUTE_M = 300_000;
/** Набор высоты и снижение занимают примерно столько пути */
const CLIMB_M = 180_000;
const AIRPORT_ALT_M = 300;

const OCTAL = "01234567";

function pickAirport(rnd: Random, exclude?: Airport): Airport {
  for (;;) {
    const airport = rnd.weighted(AIRPORTS.map((a) => [a, a.weight] as const));
    if (airport !== exclude && (!exclude || distanceM(airport, exclude) >= MIN_ROUTE_M)) {
      return airport;
    }
  }
}

function newFlight(rnd: Random, from: Airport): Flight {
  const [airline, fleet] = rnd.pick(AIRLINES);
  const to = pickAirport(rnd, from);
  return {
    hex: rnd.int(0, 0xffffff).toString(16).padStart(6, "0"),
    callsign: `${airline}${rnd.int(1, 9999)}`,
    type: rnd.pick(fleet),
    registration: `${rnd.pick(REGISTRATION_PREFIXES)}${rnd.int(100, 999)}${String.fromCharCode(65 + rnd.int(0, 25))}`,
    squawk: Array.from({ length: 4 }, () => OCTAL[rnd.int(0, 7)]).join(""),
    from,
    to,
    distance: distanceM(from, to),
    progress: 0,
    cruiseSpeed: rnd.range(225, 260),
    cruiseAlt: Math.round(rnd.range(9_500, 12_500) / 300) * 300,
  };
}

/** Где борт и как он летит в данной точке маршрута */
function flightState(f: Flight) {
  const fraction = f.progress / f.distance;
  const position: GeoPoint = interpolateGreatCircle(f.from, f.to, fraction);
  const ahead = interpolateGreatCircle(f.from, f.to, Math.min(1, fraction + 0.001));
  const edge = Math.min(f.progress, f.distance - f.progress);
  const profile = Math.min(1, edge / CLIMB_M);
  return {
    position: roundPoint({
      ...position,
      alt: AIRPORT_ALT_M + (f.cruiseAlt - AIRPORT_ALT_M) * profile,
    }),
    heading: (Math.round(bearingDeg(position, ahead) * 10) / 10) % 360,
    speed: Math.round(f.cruiseSpeed * (0.55 + 0.45 * profile)),
  };
}

/**
 * Фейковая мировая авиация для разработки без внешних API (SIMULATE=1).
 * Борта летят по большим кругам между крупными аэропортами, набирают высоту и снижаются,
 * после посадки берут новый рейс. Один борт подаёт сигнал 7700 для отладки разведсводки.
 */
export function createAircraftSimulator(opts: AircraftSimulatorOptions = {}): Connector {
  const count = opts.count ?? 10_000;
  const tickMs = opts.tickMs ?? 1_000;
  const now = opts.now ?? Date.now;
  const rnd = createRandom(opts.seed ?? 42);
  let timer: ReturnType<typeof setInterval> | undefined;

  const flights = Array.from({ length: count }, () => {
    const flight = newFlight(rnd, pickAirport(rnd));
    flight.progress = rnd.range(0, flight.distance);
    return flight;
  });
  if (flights[0]) flights[0].squawk = "7700";

  const snapshot = (time: number): TrackedObject[] =>
    flights.map((f) => ({
      id: `aircraft:${f.hex}`,
      layer: "aircraft",
      ...flightState(f),
      updatedAt: time,
      source: "simulator",
      props: {
        callsign: f.callsign,
        type: f.type,
        registration: f.registration,
        squawk: f.squawk,
        onGround: false,
        origin: f.from.code,
        destination: f.to.code,
      },
    }));

  const step = (seconds: number) => {
    for (let i = 0; i < flights.length; i++) {
      const f = flights[i]!;
      f.progress += flightState(f).speed * seconds;
      if (f.progress >= f.distance) {
        const next = newFlight(rnd, f.to);
        // Тот же борт уходит новым рейсом: hex, регистрация и отладочный 7700 остаются
        flights[i] = {
          ...next,
          hex: f.hex,
          registration: f.registration,
          type: f.type,
          squawk: f.squawk === "7700" ? f.squawk : next.squawk,
        };
      }
    }
  };

  return {
    id: "simulator-aircraft",
    layer: "aircraft",
    start(ctx) {
      ctx.upsert(snapshot(now()));
      ctx.log.info({ count }, "aircraft simulator started");
      timer = setInterval(() => {
        step(tickMs / 1000);
        ctx.upsert(snapshot(now()));
      }, tickMs);
    },
    stop() {
      clearInterval(timer);
    },
  };
}
