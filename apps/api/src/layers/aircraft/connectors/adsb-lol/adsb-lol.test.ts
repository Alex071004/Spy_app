import { describe, expect, it, vi } from "vitest";
import { AircraftPropsSchema, TrackedObjectSchema, type TrackedObject } from "@spyapp/shared";
import type { ConnectorContext } from "../../../../core/connector";
import { createAdsbLolConnector } from "./index";
import { normalizeAdsbLol, type AdsbLolResponse } from "./normalize";
import { buildCells, intervalFor, nextCell } from "./scheduler";

const NOW = 1_794_216_428_000;

// Сокращённые реальные ответы /v2/point (поля, которые мы читаем)
const SAMPLE: AdsbLolResponse = {
  now: NOW,
  ac: [
    {
      hex: "4CA6FB",
      flight: "RYR363Q ",
      r: "EI-DYX",
      t: "B738",
      alt_baro: 23975,
      alt_geom: 24425,
      gs: 438.6,
      track: 249.58,
      baro_rate: 0,
      squawk: "3602",
      emergency: "none",
      category: "A3",
      lat: 52.875289,
      lon: -6.541809,
      seen_pos: 0.024,
    },
    {
      hex: "406b90",
      flight: "EZY12AB ",
      t: "A320",
      alt_baro: "ground",
      gs: 12,
      track: 90,
      lat: 51.47,
      lon: -0.45,
      seen_pos: 2,
    },
    {
      hex: "a12345",
      flight: "N123AB  ",
      t: "C68A",
      alt_baro: 41000,
      lat: 40,
      lon: -74,
      seen_pos: 1,
      dbFlags: 8,
    },
    {
      hex: "ae1234",
      flight: "RCH123  ",
      t: "C17",
      alt_baro: 30000,
      lat: 50,
      lon: 8,
      seen_pos: 1,
      dbFlags: 1,
      squawk: "7700",
      emergency: "general",
    },
    { hex: "000001", lat: 10, lon: 10, alt_baro: 1000, seen_pos: 300 },
    { hex: "000002", alt_baro: 1000 },
  ],
};

describe("normalizeAdsbLol", () => {
  const items = normalizeAdsbLol(SAMPLE);
  const byId = Object.fromEntries(items.map((o) => [o.id, o])) as Record<string, TrackedObject>;

  it("отбрасывает приватные (LADD/PIA), устаревшие и борта без позиции", () => {
    expect(Object.keys(byId).sort()).toEqual([
      "aircraft:406b90",
      "aircraft:4ca6fb",
      "aircraft:ae1234",
    ]);
  });

  it("переводит единицы и время в контракт", () => {
    const ryr = byId["aircraft:4ca6fb"]!;
    expect(TrackedObjectSchema.parse(ryr)).toBeTruthy();
    expect(ryr.position).toEqual({ lon: -6.54181, lat: 52.87529, alt: 7445 });
    expect(ryr.speed).toBeCloseTo(225.6, 1);
    expect(ryr.heading).toBe(249.6);
    expect(ryr.updatedAt).toBe(NOW - 24);
    expect(ryr.props).toEqual({
      onGround: false,
      callsign: "RYR363Q",
      type: "B738",
      registration: "EI-DYX",
      squawk: "3602",
      category: "A3",
      verticalRate: 0,
    });
  });

  it("помечает борта на земле, военные и особые ситуации", () => {
    const ground = byId["aircraft:406b90"]!;
    expect(ground.props.onGround).toBe(true);
    expect(ground.position.alt).toBeUndefined();
    expect(byId["aircraft:ae1234"]!.props).toMatchObject({
      military: true,
      squawk: "7700",
      emergency: "general",
    });
    for (const item of items) expect(AircraftPropsSchema.safeParse(item.props).success).toBe(true);
  });
});

describe("планировщик", () => {
  const cells = buildCells([{ lon: -0.45, lat: 51.47 }]);

  it("покрывает планету сеткой из нескольких сотен кругов", () => {
    expect(cells.length).toBeGreaterThan(400);
    expect(cells.length).toBeLessThan(900);
  });

  it("сначала опрашивает районы с аэропортами, потом смотрит на опоздание", () => {
    const first = nextCell(cells, 1_000_000)!;
    expect(first.count).toBeGreaterThan(0);
    expect(Math.abs(first.center.lat - 51.47)).toBeLessThan(10);
    // Только что опрошенный круг не нужен, пока не прошёл его интервал
    for (const c of cells) c.lastPollAt = 1_000_000;
    expect(nextCell(cells, 1_000_000 + 5_000)).toBeUndefined();
    expect(nextCell(cells, 1_000_000 + intervalFor(first.count))).toBeDefined();
  });

  it("поднимает приоритет кругов, которые смотрят клиенты", () => {
    for (const c of cells) {
      c.lastPollAt = 0;
      c.count = 10;
    }
    const tokyo = nextCell(cells, intervalFor(10) / 2, [[135, 30, 145, 40]])!;
    expect(tokyo.center.lon).toBeGreaterThan(120);
    expect(tokyo.center.lon).toBeLessThan(160);
  });
});

describe("коннектор adsb-lol", () => {
  it("опрашивает API с паузой после 429 и кладёт борта в мир", async () => {
    vi.useFakeTimers();
    const upserts: TrackedObject[][] = [];
    const statuses = [429, 200];
    const fetchMock = vi.fn(async () => {
      const status = statuses.shift() ?? 200;
      return status === 200
        ? new Response(JSON.stringify(SAMPLE), { status })
        : new Response("slow down", { status, headers: { "retry-after": "40" } });
    });
    const ctx = {
      upsert: (items: TrackedObject[]) => upserts.push(items),
      views: () => [],
      log: { info: () => {}, warn: () => {} },
    } as unknown as ConnectorContext;
    let time = 1_000_000;
    const connector = createAdsbLolConnector({
      fetch: fetchMock as unknown as typeof fetch,
      requestsPerSecond: 2,
      now: () => time,
    });

    connector.start(ctx);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toMatch(
      /\/v2\/point\/-?\d+\.\d{2}\/-?\d+\.\d{2}\/250$/,
    );

    // 429 с Retry-After: 40 — до истечения паузы запросов нет
    time += 30_000;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    time += 11_000;
    await vi.advanceTimersByTimeAsync(1_500);
    connector.stop();
    vi.useRealTimers();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(upserts[0]?.map((o) => o.id)).toContain("aircraft:4ca6fb");
  });
});
