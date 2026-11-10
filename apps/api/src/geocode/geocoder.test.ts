import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GeocodeResponseSchema } from "@spyapp/shared";
import { buildApp } from "../app";
import { AIRPORTS } from "../layers/aircraft/airports";
import { OSM_ATTRIBUTION, createLocalGeocoder, createNominatimGeocoder } from "./geocoder";

// Сокращённый реальный ответ Nominatim на «Токио»
const TOKYO = [
  {
    osm_type: "relation",
    osm_id: 1543125,
    lat: "35.6768601",
    lon: "139.7638947",
    name: "Токио",
    display_name: "Токио, Япония",
    type: "administrative",
    addresstype: "province",
    boundingbox: ["20.2145811", "35.8984245", "135.8536855", "154.2055410"],
  },
];

const local = createLocalGeocoder(AIRPORTS);

describe("локальный геокодер", () => {
  it("находит город по началу названия на нужном языке", async () => {
    const ru = await local.geocode("токи", "ru");
    expect(ru.results[0]).toMatchObject({
      id: "airport:HND",
      label: "Токио",
      kind: "city",
      viewAltitudeM: 50_000,
    });
    expect(ru.source).toBe("local");
    expect((await local.geocode("lon", "en")).results[0]?.label).toBe("London");
  });
});

describe("Nominatim", () => {
  function setup(fetchImpl: (url: string) => Promise<Response>) {
    let time = 0;
    const sleeps: number[] = [];
    const fetchMock = vi.fn(fetchImpl);
    const warn = vi.fn();
    const geocoder = createNominatimGeocoder({
      fallback: local,
      fetch: fetchMock as unknown as typeof fetch,
      now: () => time,
      sleep: async (ms) => {
        sleeps.push(ms);
        time += ms;
      },
      log: { warn },
    });
    return { geocoder, fetchMock, sleeps, warn };
  }

  it("переводит ответ в контракт: рамка [w,s,e,n], высота камеры по типу, атрибуция OSM", async () => {
    const { geocoder, fetchMock } = setup(async () => new Response(JSON.stringify(TOKYO)));
    const body = GeocodeResponseSchema.parse(await geocoder.geocode("Токио", "ru"));
    expect(body).toMatchObject({ source: "nominatim", attribution: OSM_ATTRIBUTION });
    expect(body.results[0]).toMatchObject({
      id: "osm:relation:1543125",
      label: "Токио",
      kind: "province",
      position: { lon: 139.7638947, lat: 35.6768601 },
      bbox: [135.8536855, 20.2145811, 154.205541, 35.8984245],
      viewAltitudeM: 500_000,
    });
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.get("format")).toBe("jsonv2");
    expect(url.searchParams.get("accept-language")).toBe("ru,en");
  });

  it("держит паузу между запросами, кэширует и склеивает одинаковые", async () => {
    const { geocoder, fetchMock, sleeps } = setup(async () => new Response(JSON.stringify(TOKYO)));
    await Promise.all([
      geocoder.geocode("Токио", "ru"),
      geocoder.geocode(" токио ", "ru"),
      geocoder.geocode("Paris", "en"),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([1_100]);
    await geocoder.geocode("ТОКИО", "ru");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("при ошибке отвечает локальными местами и пишет предупреждение", async () => {
    const { geocoder, warn } = setup(async () => new Response("", { status: 503 }));
    const body = await geocoder.geocode("москва", "ru");
    expect(body.source).toBe("local");
    expect(body.results[0]?.id).toBe("airport:SVO");
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe("GET /api/geocode", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeAll(async () => {
    app = await buildApp({ logLevel: "silent" });
  });
  afterAll(() => app.close());

  it("по умолчанию ищет по встроенным местам, проверяет параметры", async () => {
    const res = await app.inject({ url: "/api/geocode?q=%D1%81%D0%B8%D0%B4%D0%BD%D0%B5%D0%B9" });
    expect(res.statusCode).toBe(200);
    expect(GeocodeResponseSchema.parse(res.json()).results[0]?.id).toBe("airport:SYD");
    expect((await app.inject({ url: "/api/geocode?q=x" })).statusCode).toBe(400);
    expect((await app.inject({ url: "/api/geocode?q=paris&lang=de" })).statusCode).toBe(400);
  });
});
