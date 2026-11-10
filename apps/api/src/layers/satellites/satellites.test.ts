import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ISS_NORAD_ID, SatellitesResponseSchema } from "@spyapp/shared";
import { buildApp } from "../../app";
import { FIXTURE_STATIONS_TLE } from "./fixtures";
import {
  createCelestrakSatellites,
  createFixtureSatellites,
  parseTle,
  type SatelliteSource,
} from "./tle-source";

// Кэш тестов рядом с пакетом (в .gitignore), чтобы не мусорить в системном temp
const CACHE_ROOT = fileURLToPath(new URL("../../../.cache", import.meta.url));
let cacheDir: string;

beforeAll(async () => {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(CACHE_ROOT, { recursive: true });
  cacheDir = await mkdtemp(join(CACHE_ROOT, "test-"));
});
afterAll(() => rm(cacheDir, { recursive: true, force: true }));

describe("parseTle", () => {
  it("разбирает тройки и пропускает мусор", () => {
    const parsed = parseTle(`garbage line\r\n${FIXTURE_STATIONS_TLE}\n1 broken`);
    expect(parsed.length).toBe(15);
    expect(parsed[0]).toMatchObject({ noradId: ISS_NORAD_ID, name: "ISS (ZARYA)" });
    expect(parsed.every((s) => s.line1.length === 69 && s.line2.length === 69)).toBe(true);
  });
});

describe("CelesTrak", () => {
  let time = 1_000_000_000;
  const now = () => time;
  const tleResponse = () => new Response(FIXTURE_STATIONS_TLE);

  it("кэширует на диске: второй экземпляр (рестарт сервера) не идёт в сеть", async () => {
    const fetch1 = vi.fn(async () => tleResponse());
    const first = createCelestrakSatellites({
      cacheDir,
      now,
      fetch: fetch1 as unknown as typeof fetch,
    });
    const [a, b] = await Promise.all([first.get("stations"), first.get("stations")]);
    expect(fetch1).toHaveBeenCalledTimes(1);
    expect(String((fetch1.mock.calls[0] as unknown[])[0])).toContain("GROUP=stations&FORMAT=tle");
    expect(SatellitesResponseSchema.parse(a)).toEqual(b);

    const fetch2 = vi.fn(async () => tleResponse());
    const second = createCelestrakSatellites({
      cacheDir,
      now,
      fetch: fetch2 as unknown as typeof fetch,
    });
    expect((await second.get("stations")).satellites).toHaveLength(15);
    expect(fetch2).not.toHaveBeenCalled();
  });

  it("после TTL обновляет, при сбое отдаёт старый набор и не долбит источник", async () => {
    const fetchMock = vi.fn(async () => new Response("blocked", { status: 403 }));
    const warn = vi.fn();
    const source = createCelestrakSatellites({
      cacheDir,
      now,
      fetch: fetchMock as unknown as typeof fetch,
      log: { warn },
    });
    time += 7 * 60 * 60_000;
    const stale = await source.get("stations");
    expect(stale.source).toBe("celestrak");
    expect(stale.satellites).toHaveLength(15);
    expect(warn).toHaveBeenCalledOnce();

    time += 60_000;
    await source.get("stations");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("без кэша и при сбое пробрасывает ошибку", async () => {
    const source = createCelestrakSatellites({
      cacheDir,
      now,
      fetch: (async () => new Response("", { status: 500 })) as unknown as typeof fetch,
    });
    await expect(source.get("weather")).rejects.toThrow("celestrak 500");
  });
});

describe("GET /api/satellites/tle", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const failing: SatelliteSource = { get: async () => Promise.reject(new Error("down")) };
  let failingApp: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ logLevel: "silent", satellites: createFixtureSatellites() });
    failingApp = await buildApp({ logLevel: "silent", satellites: failing });
  });
  afterAll(async () => {
    await app.close();
    await failingApp.close();
  });

  it("по умолчанию отдаёт станции с кэшем для браузера", async () => {
    const res = await app.inject({ url: "/api/satellites/tle" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=3600");
    const body = SatellitesResponseSchema.parse(res.json());
    expect(body.group).toBe("stations");
    expect(body.satellites.some((s) => s.noradId === ISS_NORAD_ID)).toBe(true);
  });

  it("400 на неизвестную группу, 503 если источник недоступен", async () => {
    expect((await app.inject({ url: "/api/satellites/tle?group=ufo" })).statusCode).toBe(400);
    expect((await failingApp.inject({ url: "/api/satellites/tle?group=gps" })).statusCode).toBe(
      503,
    );
  });
});
