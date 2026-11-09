import type { TrackedObject } from "./model";

// Статичные примеры объектов для разработки UI без API и для тестов.
// Значения правдоподобные, но вымышленные.

const t = Date.UTC(2026, 10, 9, 12, 0, 0);

export const fixtureAircraft: TrackedObject[] = [
  {
    id: "aircraft:4ca7b5",
    layer: "aircraft",
    position: { lon: -5.8, lat: 46.2, alt: 11_280 },
    heading: 212,
    speed: 236,
    updatedAt: t,
    source: "fixture",
    props: { callsign: "RYR4KP", type: "B738", registration: "EI-ABC", squawk: "7700" },
  },
  {
    id: "aircraft:3c6444",
    layer: "aircraft",
    position: { lon: 37.9, lat: 55.4, alt: 3_050 },
    heading: 75,
    speed: 140,
    updatedAt: t,
    source: "fixture",
    props: { callsign: "AFL1234", type: "A321", registration: "RA-73700", squawk: "2301" },
  },
  {
    id: "aircraft:a1b2c3",
    layer: "aircraft",
    position: { lon: -150.4, lat: 35.1, alt: 12_190 },
    heading: 248,
    speed: 255,
    updatedAt: t,
    source: "fixture",
    props: { callsign: "UAL837", type: "B789", registration: "N29975", squawk: "1200" },
  },
];

export const fixtureVessels: TrackedObject[] = [
  {
    id: "vessel:636019825",
    layer: "vessels",
    position: { lon: 56.3, lat: 26.5 },
    heading: 305,
    speed: 6.2,
    updatedAt: t,
    source: "fixture",
    props: { name: "OCEAN PEARL", mmsi: "636019825", shipType: "tanker", flag: "LR" },
  },
  {
    id: "vessel:477123400",
    layer: "vessels",
    position: { lon: 103.9, lat: 1.2 },
    heading: 120,
    speed: 8.7,
    updatedAt: t,
    source: "fixture",
    props: { name: "MAERSK EXAMPLE", mmsi: "477123400", shipType: "cargo", flag: "HK" },
  },
];

export const fixtures = { aircraft: fixtureAircraft, vessels: fixtureVessels };
