import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  ApiErrorSchema,
  ObjectDetailsResponseSchema,
  SearchResponseSchema,
  type ObjectPhoto,
  type TrackedObject,
} from "@spyapp/shared";
import { fixtureAircraft, fixtureVessels } from "@spyapp/shared/fixtures";
import { buildApp } from "../app";
import type { Connector } from "../core/connector";
import { search } from "../core/search";
import { WorldState } from "../core/world-state";
import { AIRPORTS } from "../layers/aircraft/airports";
import { createPlanespottersPhotos } from "../layers/aircraft/photos";

const PHOTO: ObjectPhoto = {
  thumbnailUrl: "https://t.plnspttrs.net/1/1_t.jpg",
  largeUrl: "https://t.plnspttrs.net/1/1_280.jpg",
  pageUrl: "https://www.planespotters.net/photo/1/ei-abc",
  photographer: "Test Photographer",
  source: "planespotters",
};

/** Коннектор, который один раз кладёт заданные объекты */
function staticConnector(items: TrackedObject[]): Connector {
  return { id: "static", layer: "aircraft", start: (ctx) => ctx.upsert(items), stop: () => {} };
}

describe("search", () => {
  const world = new WorldState();
  const now = Date.now();
  world.upsert([...fixtureAircraft, ...fixtureVessels].map((o) => ({ ...o, updatedAt: now })));

  it("находит борт по позывному, регистрации и hex", () => {
    expect(search(world, AIRPORTS, "afl1234")[0]).toMatchObject({
      kind: "object",
      id: "aircraft:3c6444",
      label: "AFL1234",
    });
    expect(search(world, AIRPORTS, "RA-73700")[0]?.id).toBe("aircraft:3c6444");
    expect(search(world, AIRPORTS, "4ca7b5")[0]?.id).toBe("aircraft:4ca7b5");
  });

  it("находит судно и город на двух языках", () => {
    expect(search(world, AIRPORTS, "ocean")[0]).toMatchObject({
      layer: "vessels",
      label: "OCEAN PEARL",
    });
    expect(search(world, AIRPORTS, "Токио")[0]).toMatchObject({ kind: "place", id: "airport:HND" });
    expect(search(world, AIRPORTS, "london")[0]).toMatchObject({
      kind: "place",
      id: "airport:LHR",
    });
  });

  it("ставит совпадение по типу ниже идентифицирующих полей и уважает limit", () => {
    world.upsert([
      { ...fixtureAircraft[0]!, id: "aircraft:b738aa", props: { callsign: "B738X", type: "A320" } },
    ]);
    const results = search(world, AIRPORTS, "b738");
    expect(results[0]?.id).toBe("aircraft:b738aa");
    expect(search(world, AIRPORTS, "a", { limit: 5 })).toEqual([]);
    expect(search(world, AIRPORTS, "sa", { limit: 2 })).toHaveLength(2);
  });
});

describe("planespotters", () => {
  const apiPhoto = {
    photos: [
      {
        thumbnail: { src: PHOTO.thumbnailUrl },
        thumbnail_large: { src: PHOTO.largeUrl },
        link: PHOTO.pageUrl,
        photographer: PHOTO.photographer,
      },
    ],
  };

  it("кэширует ответ и склеивает одновременные запросы", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(apiPhoto)));
    const photos = createPlanespottersPhotos({ fetch: fetchMock as unknown as typeof fetch });
    const [a, b] = await Promise.all([photos.find("4CA6FB"), photos.find("4ca6fb")]);
    expect(a).toEqual(PHOTO);
    expect(b).toEqual(PHOTO);
    await photos.find("4ca6fb");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("если по hex фото нет, ищет по регистрации; пустой ответ тоже кэшируется", async () => {
    const urls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify(url.includes("/reg/") ? apiPhoto : { photos: [] }));
    });
    const photos = createPlanespottersPhotos({ fetch: fetchMock as unknown as typeof fetch });
    expect(await photos.find("abc123", "EI-ABC")).toEqual(PHOTO);
    expect(urls.map((u) => u.split("/pub/photos/")[1])).toEqual(["hex/abc123", "reg/EI-ABC"]);
    expect(await photos.find("000000")).toBeNull();
    await photos.find("000000");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("REST", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const find = vi.fn(async () => PHOTO);
  const real = { ...fixtureAircraft[1]!, source: "adsb-lol", updatedAt: Date.now() };
  const simulated = { ...fixtureAircraft[0]!, source: "simulator", updatedAt: Date.now() };

  beforeAll(async () => {
    app = await buildApp({
      logLevel: "silent",
      photos: { find },
      connectors: [staticConnector([real, simulated])],
    });
    await app.ready();
  });
  afterAll(() => app.close());

  it("GET /api/objects/:id отдаёт объект, название типа и фото", async () => {
    const res = await app.inject({ url: `/api/objects/${real.id}` });
    expect(res.statusCode).toBe(200);
    const body = ObjectDetailsResponseSchema.parse(res.json());
    expect(body).toMatchObject({ object: { id: real.id }, typeName: "Airbus A321", photo: PHOTO });
    expect(find).toHaveBeenCalledWith("3c6444", "RA-73700");
  });

  it("не ищет фото для вымышленных бортов симулятора", async () => {
    find.mockClear();
    const body = ObjectDetailsResponseSchema.parse(
      (await app.inject({ url: `/api/objects/${simulated.id}` })).json(),
    );
    expect(body.photo).toBeNull();
    expect(find).not.toHaveBeenCalled();
  });

  it("отвечает без фото, если источник упал", async () => {
    find.mockRejectedValueOnce(new Error("timeout"));
    const body = ObjectDetailsResponseSchema.parse(
      (await app.inject({ url: `/api/objects/${real.id}` })).json(),
    );
    expect(body.photo).toBeNull();
  });

  it("404 для неизвестного объекта, 400 для кривого запроса поиска", async () => {
    const missing = await app.inject({ url: "/api/objects/aircraft:nope" });
    expect(missing.statusCode).toBe(404);
    expect(ApiErrorSchema.parse(missing.json()).error).toBe("not_found");
    const bad = await app.inject({ url: "/api/search?q=moscow&limit=500" });
    expect(bad.statusCode).toBe(400);
  });

  it("GET /api/search ищет по объектам и местам", async () => {
    const body = SearchResponseSchema.parse(
      (await app.inject({ url: "/api/search?q=москва" })).json(),
    );
    expect(body.results[0]).toMatchObject({ kind: "place", id: "airport:SVO" });
    const byCallsign = SearchResponseSchema.parse(
      (await app.inject({ url: "/api/search?q=AFL" })).json(),
    );
    expect(byCallsign.results[0]?.id).toBe(real.id);
  });
});
