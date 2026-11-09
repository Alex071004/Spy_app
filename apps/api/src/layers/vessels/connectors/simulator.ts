import {
  bearingDeg,
  destinationPoint,
  distanceM,
  interpolateGreatCircle,
  roundPoint,
  normalizeLon,
  type GeoPoint,
  type TrackedObject,
} from "@spyapp/shared";
import type { Connector } from "../../../core/connector";
import { createRandom, type Random } from "../../../core/random";
import {
  FISHING_GROUNDS,
  FLAGS,
  NAME_PARTS,
  SEA_LANES,
  SHIP_TYPES,
  type SeaLane,
} from "./simulator-data";

interface PreparedLane extends SeaLane {
  /** Путь от начала маршрута до каждой точки, метры */
  cumulative: number[];
  length: number;
}

interface VesselBase {
  mmsi: string;
  name: string;
  shipType: string;
  flag: string;
  speed: number;
}

interface LaneVessel extends VesselBase {
  kind: "lane";
  lane: PreparedLane;
  /** Положение вдоль маршрута, метры от начала */
  along: number;
  dir: 1 | -1;
  /** Сдвиг от оси маршрута, чтобы суда не шли одной ниткой */
  offset: { lon: number; lat: number };
}

interface FishingVessel extends VesselBase {
  kind: "fishing";
  ground: (typeof FISHING_GROUNDS)[number];
  position: GeoPoint;
  heading: number;
}

type Vessel = LaneVessel | FishingVessel;

export interface VesselSimulatorOptions {
  count?: number;
  tickMs?: number;
  seed?: number;
  now?: () => number;
}

const SPEED_BY_TYPE: Record<string, [number, number]> = {
  tanker: [5.5, 7.5],
  cargo: [7, 11],
  passenger: [9, 12],
  military: [6, 14],
  fishing: [1, 4],
};
const FISHING_SHARE = 0.2;
const MAX_OFFSET_DEG = 0.18;

function prepareLane(lane: SeaLane): PreparedLane {
  const cumulative = [0];
  for (let i = 1; i < lane.points.length; i++) {
    const [aLon, aLat] = lane.points[i - 1]!;
    const [bLon, bLat] = lane.points[i]!;
    cumulative.push(
      cumulative[i - 1]! + distanceM({ lon: aLon, lat: aLat }, { lon: bLon, lat: bLat }),
    );
  }
  return { ...lane, cumulative, length: cumulative[cumulative.length - 1]! };
}

function pointAlong(lane: PreparedLane, along: number): GeoPoint {
  let i = 1;
  while (i < lane.cumulative.length - 1 && lane.cumulative[i]! < along) i++;
  const start = lane.cumulative[i - 1]!;
  const span = lane.cumulative[i]! - start;
  const [aLon, aLat] = lane.points[i - 1]!;
  const [bLon, bLat] = lane.points[i]!;
  return interpolateGreatCircle(
    { lon: aLon, lat: aLat },
    { lon: bLon, lat: bLat },
    span ? (along - start) / span : 0,
  );
}

function base(rnd: Random, shipType: string): VesselBase {
  const [min, max] = SPEED_BY_TYPE[shipType] ?? [5, 10];
  return {
    mmsi: String(rnd.int(200_000_000, 775_999_999)),
    name: `${rnd.pick(NAME_PARTS.first)} ${rnd.pick(NAME_PARTS.second)}`,
    shipType,
    flag: rnd.pick(FLAGS),
    speed: Math.round(rnd.range(min, max) * 10) / 10,
  };
}

function laneState(v: LaneVessel) {
  const here = pointAlong(v.lane, v.along);
  const ahead = pointAlong(v.lane, Math.min(v.lane.length, Math.max(0, v.along + v.dir * 2_000)));
  return {
    position: roundPoint({
      lon: normalizeLon(here.lon + v.offset.lon),
      lat: here.lat + v.offset.lat,
    }),
    heading: (Math.round(bearingDeg(here, ahead) * 10) / 10) % 360,
    destination: v.lane.ends[v.dir > 0 ? 1 : 0],
  };
}

/**
 * Фейковое мировое судоходство для разработки без внешних API (SIMULATE=1).
 * Большинство судов идут по основным морским путям туда и обратно, часть рыбачит в известных районах.
 */
export function createVesselSimulator(opts: VesselSimulatorOptions = {}): Connector {
  const count = opts.count ?? 5_000;
  const tickMs = opts.tickMs ?? 2_000;
  const now = opts.now ?? Date.now;
  const rnd = createRandom(opts.seed ?? 7);
  const lanes = SEA_LANES.map(prepareLane);
  let timer: ReturnType<typeof setInterval> | undefined;

  const vessels: Vessel[] = Array.from({ length: count }, (): Vessel => {
    if (rnd.next() < FISHING_SHARE) {
      const ground = rnd.pick(FISHING_GROUNDS);
      return {
        kind: "fishing",
        ...base(rnd, "fishing"),
        ground,
        position: destinationPoint(
          ground,
          rnd.range(0, 360),
          rnd.range(0, ground.radiusDeg * 111_000),
        ),
        heading: rnd.range(0, 360),
      };
    }
    const lane = rnd.weighted(lanes.map((l) => [l, l.weight] as const));
    return {
      kind: "lane",
      ...base(rnd, rnd.weighted(SHIP_TYPES)),
      lane,
      along: rnd.range(0, lane.length),
      dir: rnd.next() < 0.5 ? 1 : -1,
      offset: {
        lon: rnd.range(-MAX_OFFSET_DEG, MAX_OFFSET_DEG),
        lat: rnd.range(-MAX_OFFSET_DEG, MAX_OFFSET_DEG),
      },
    };
  });

  const step = (seconds: number) => {
    for (const v of vessels) {
      if (v.kind === "lane") {
        v.along += v.dir * v.speed * seconds;
        // На конце маршрута судно разворачивается и идёт обратно
        if (v.along > v.lane.length) {
          v.along = 2 * v.lane.length - v.along;
          v.dir = -1;
        } else if (v.along < 0) {
          v.along = -v.along;
          v.dir = 1;
        }
        continue;
      }
      const outside = distanceM(v.position, v.ground) > v.ground.radiusDeg * 111_000;
      v.heading = outside
        ? bearingDeg(v.position, v.ground)
        : (v.heading + rnd.range(-12, 12) + 360) % 360;
      v.position = destinationPoint(v.position, v.heading, v.speed * seconds);
    }
  };

  const snapshot = (time: number): TrackedObject[] =>
    vessels.map((v) => {
      const state =
        v.kind === "lane"
          ? laneState(v)
          : {
              position: roundPoint(v.position),
              heading: (Math.round(v.heading * 10) / 10) % 360,
              destination: undefined,
            };
      return {
        id: `vessel:${v.mmsi}`,
        layer: "vessels",
        position: state.position,
        heading: state.heading,
        speed: v.speed,
        updatedAt: time,
        source: "simulator",
        props: {
          name: v.name,
          mmsi: v.mmsi,
          shipType: v.shipType,
          flag: v.flag,
          ...(state.destination ? { destination: state.destination } : {}),
        },
      };
    });

  return {
    id: "simulator-vessels",
    layer: "vessels",
    start(ctx) {
      ctx.upsert(snapshot(now()));
      ctx.log.info({ count }, "vessel simulator started");
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
