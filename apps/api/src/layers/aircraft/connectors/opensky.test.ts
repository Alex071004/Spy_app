import { describe, expect, it, vi } from "vitest";
import { AircraftPropsSchema, TrackedObjectSchema, type TrackedObject } from "@spyapp/shared";
import type { ConnectorContext } from "../../../core/connector";
import { WorldState } from "../../../core/world-state";
import { createAdsbLolPrivacyList } from "../privacy";
import {
  createOpenSkyConnector,
  normalizeOpenSky,
  openSkyTtlMs,
  type OpenSkyResponse,
} from "./opensky";

const T = 1_794_394_022;

// Реальный вектор из /states/all + синтетические крайние случаи
const SAMPLE: OpenSkyResponse = {
  time: T,
  states: [
    [
      "80162a",
      "IGO7739 ",
      "India",
      T - 9,
      T - 9,
      74.6688,
      19.6957,
      1889.76,
      false,
      120.43,
      268.29,
      -5.2,
      null,
      1958.34,
      null,
      false,
      0,
      4,
    ],
    [
      "4ca6fb",
      "RYR363Q ",
      "Ireland",
      T - 1,
      T - 1,
      -6.5418,
      52.8752,
      7300,
      false,
      225.6,
      249.58,
      0,
      null,
      7445,
      "7700",
      false,
      0,
      4,
    ],
    [
      "406b90",
      "EZY12AB ",
      "United Kingdom",
      T - 2,
      T - 2,
      -0.45,
      51.47,
      null,
      true,
      6,
      90,
      null,
      null,
      null,
      "2000",
      false,
      0,
    ],
    [
      "a12345",
      "N123AB  ",
      "United States",
      T - 1,
      T - 1,
      -74,
      40,
      12000,
      false,
      200,
      10,
      0,
      null,
      12100,
      null,
      false,
      0,
    ],
    [
      "000001",
      null,
      "Unknown",
      null,
      T,
      null,
      null,
      null,
      false,
      null,
      null,
      null,
      null,
      null,
      null,
      false,
      0,
    ],
    [
      "000002",
      "OLD1    ",
      "Unknown",
      T - 600,
      T - 600,
      10,
      10,
      1000,
      false,
      100,
      0,
      0,
      null,
      1000,
      null,
      false,
      0,
    ],
  ],
};

describe("normalizeOpenSky", () => {
  const hidden = new Set(["a12345"]);
  const items = normalizeOpenSky(SAMPLE, { isHidden: (hex) => hidden.has(hex) });
  const byId = Object.fromEntries(items.map((o) => [o.id, o])) as Record<string, TrackedObject>;

  it("отбрасывает скрытые (LADD/PIA), без позиции и устаревшие", () => {
    expect(Object.keys(byId).sort()).toEqual([
      "aircraft:406b90",
      "aircraft:4ca6fb",
      "aircraft:80162a",
    ]);
  });

  it("переводит вектор в контракт", () => {
    const igo = byId["aircraft:80162a"]!;
    expect(TrackedObjectSchema.parse(igo)).toBeTruthy();
    expect(igo).toMatchObject({
      position: { lon: 74.6688, lat: 19.6957, alt: 1958 },
      heading: 268.3,
      speed: 120.4,
      updatedAt: (T - 9) * 1000,
      source: "opensky",
      props: {
        callsign: "IGO7739",
        country: "India",
        category: "A3",
        onGround: false,
        verticalRate: -5.2,
      },
    });
    expect(byId["aircraft:4ca6fb"]!.props.squawk).toBe("7700");
    expect(byId["aircraft:406b90"]!.position.alt).toBeUndefined();
    for (const item of items) expect(AircraftPropsSchema.safeParse(item.props).success).toBe(true);
  });
});

describe("WorldState: несколько источников", () => {
  const base = (
    source: string,
    updatedAt: number,
    props: Record<string, unknown>,
  ): TrackedObject => ({
    id: "aircraft:4ca6fb",
    layer: "aircraft",
    position: { lon: 0, lat: 0 },
    updatedAt,
    source,
    props,
  });

  it("старое не затирает свежее, поля другого источника сохраняются", () => {
    const world = new WorldState();
    world.upsert([
      base("adsb-lol", 2_000, { onGround: false, type: "B738", registration: "EI-DYX" }),
    ]);
    world.upsert([base("opensky", 1_000, { onGround: false, country: "Ireland" })]);
    expect(world.get("aircraft:4ca6fb")?.source).toBe("adsb-lol");
    world.upsert([base("opensky", 3_000, { onGround: false, country: "Ireland" })]);
    expect(world.get("aircraft:4ca6fb")).toMatchObject({
      source: "opensky",
      props: { type: "B738", registration: "EI-DYX", country: "Ireland" },
    });
  });

  it("держит объекты редкого источника дольше TTL слоя", () => {
    const world = new WorldState();
    world.setSourceTtl("opensky", openSkyTtlMs(false));
    world.upsert([base("opensky", 0, { onGround: false })]);
    expect(world.sweep(10 * 60_000)).toBe(0);
    expect(world.sweep(31 * 60_000)).toBe(1);
  });
});

describe("коннектор OpenSky", () => {
  function ctx(upserts: TrackedObject[][]) {
    return {
      upsert: (items: TrackedObject[]) => upserts.push(items),
      views: () => [],
      log: { info: () => {}, warn: () => {} },
    } as unknown as ConnectorContext;
  }

  it("ждёт список приватности, потом опрашивает анонимно", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes("/v2/ladd"))
        return new Response(JSON.stringify({ ac: [{ hex: "80162A" }] }));
      if (url.includes("/v2/pia")) return new Response(JSON.stringify({ ac: [] }));
      return new Response(JSON.stringify(SAMPLE));
    });
    const f = fetchMock as unknown as typeof fetch;
    const upserts: TrackedObject[][] = [];
    const connector = createOpenSkyConnector({
      fetch: f,
      privacy: createAdsbLolPrivacyList({ fetch: f }),
    });
    expect(connector.authenticated).toBe(false);
    expect(connector.ttlMs).toBe(30 * 60_000);
    connector.start(ctx(upserts));
    await vi.waitFor(() => expect(upserts).toHaveLength(1));
    connector.stop();

    expect(calls.map((u) => new URL(u).pathname)).toEqual([
      "/v2/ladd",
      "/v2/pia",
      "/api/states/all",
    ]);
    expect(upserts[0]!.map((o) => o.id)).not.toContain("aircraft:80162a");
  });

  it("с аккаунтом получает токен и шлёт Bearer", async () => {
    const headers: Record<string, string>[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/token")) {
        expect(String(init?.body)).toContain("grant_type=client_credentials");
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 1800 }));
      }
      headers.push(init?.headers as Record<string, string>);
      return new Response(JSON.stringify(SAMPLE));
    });
    const upserts: TrackedObject[][] = [];
    const connector = createOpenSkyConnector({
      clientId: "id",
      clientSecret: "secret",
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(connector.ttlMs).toBe(3 * 60_000);
    connector.start(ctx(upserts));
    await vi.waitFor(() => expect(upserts).toHaveLength(1));
    connector.stop();
    expect(headers[0]?.authorization).toBe("Bearer tok");
  });
});
