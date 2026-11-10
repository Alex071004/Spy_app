import type { BBox, GeocodeResponse, GeocodeResult } from "@spyapp/shared";
import type { Airport } from "../layers/aircraft/airports";

export type GeocodeLang = "ru" | "en";

export interface Geocoder {
  geocode(query: string, lang: GeocodeLang): Promise<GeocodeResponse>;
}

/** Высота камеры по типу места: страну видно целиком, улицу — вблизи */
const VIEW_ALTITUDE_M: Record<string, number> = {
  country: 3_000_000,
  state: 500_000,
  province: 500_000,
  region: 500_000,
  state_district: 300_000,
  county: 200_000,
  city: 50_000,
  municipality: 50_000,
  town: 25_000,
  airport: 15_000,
  aerodrome: 15_000,
  village: 8_000,
  hamlet: 5_000,
  suburb: 6_000,
  city_district: 10_000,
  neighbourhood: 3_000,
  quarter: 3_000,
  road: 2_000,
  building: 800,
  house: 800,
  amenity: 800,
  // Достопримечательности и объекты: башни, мосты, памятники, парки
  man_made: 1_500,
  tourism: 1_500,
  historic: 1_500,
  leisure: 2_000,
  aeroway: 15_000,
  natural: 20_000,
};
const DEFAULT_VIEW_ALTITUDE_M = 30_000;

export const viewAltitudeFor = (kind: string) => VIEW_ALTITUDE_M[kind] ?? DEFAULT_VIEW_ALTITUDE_M;

/** Запасной геокодер: встроенный список аэропортов (SIMULATE=1, сбой или перегрузка Nominatim) */
export function createLocalGeocoder(places: readonly Airport[]): Geocoder {
  return {
    async geocode(query, lang) {
      const q = query.trim().toLowerCase();
      const results: GeocodeResult[] = places
        .filter((p) => [p.code, p.city, p.cityRu].some((v) => v.toLowerCase().startsWith(q)))
        .slice(0, 5)
        .map((p) => ({
          id: `airport:${p.code}`,
          label: lang === "ru" ? p.cityRu : p.city,
          description: `${lang === "ru" ? p.city : p.cityRu} · ${p.code}`,
          kind: "city",
          position: { lon: p.lon, lat: p.lat },
          viewAltitudeM: viewAltitudeFor("city"),
        }));
      return { query, results, source: "local", attribution: "" };
    },
  };
}

interface NominatimPlace {
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  type?: string;
  addresstype?: string;
  /** [south, north, west, east] строками */
  boundingbox?: [string, string, string, string];
}

export interface NominatimOptions {
  /** Куда откатываться при SIMULATE, сбое, таймауте и переполненной очереди */
  fallback: Geocoder;
  baseUrl?: string;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Пауза между запросами. Правило публичного Nominatim: не больше 1 в секунду */
  spacingMs?: number;
  /** Сколько запросов может ждать очереди; дальше сразу запасной ответ */
  maxQueue?: number;
  cacheTtlMs?: number;
  log?: { warn(obj: object, msg: string): void };
}

const USER_AGENT = "SpyApp/0.1 (+https://github.com/Alex071004/Spy_app)";
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_CACHE = 2_000;
export const OSM_ATTRIBUTION = "© OpenStreetMap contributors (ODbL)";

function toResult(p: NominatimPlace): GeocodeResult {
  const kind = p.addresstype ?? p.type ?? "place";
  const result: GeocodeResult = {
    id: `osm:${p.osm_type}:${p.osm_id}`,
    label: p.name || p.display_name.split(",")[0]!.trim(),
    description: p.display_name,
    kind,
    position: { lon: Number(p.lon), lat: Number(p.lat) },
    viewAltitudeM: viewAltitudeFor(kind),
  };
  if (p.boundingbox) {
    const [s, n, w, e] = p.boundingbox.map(Number) as [number, number, number, number];
    const bbox: BBox = [w, s, e, n];
    if (bbox.every(Number.isFinite)) result.bbox = bbox;
  }
  return result;
}

/**
 * Геокодинг через публичный Nominatim (OpenStreetMap).
 * Его правила: ≤ 1 запроса в секунду, понятный User-Agent, кэширование и никаких подсказок по мере набора.
 * Поэтому все запросы идут через одну очередь с паузой, ответы кэшируются на сутки,
 * а клиент вызывает геокодинг только по явному действию (Enter, команда goto).
 */
export function createNominatimGeocoder(opts: NominatimOptions): Geocoder {
  const baseUrl = opts.baseUrl ?? "https://nominatim.openstreetmap.org/search";
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const spacingMs = opts.spacingMs ?? 1_100;
  const maxQueue = opts.maxQueue ?? 10;
  const cacheTtlMs = opts.cacheTtlMs ?? 24 * 60 * 60_000;
  const cache = new Map<string, { response: GeocodeResponse; expires: number }>();
  const inFlight = new Map<string, Promise<GeocodeResponse>>();
  let nextSlot = 0;
  let queued = 0;

  const request = async (query: string, lang: GeocodeLang): Promise<GeocodeResponse> => {
    queued++;
    try {
      const wait = Math.max(0, nextSlot - now());
      nextSlot = Math.max(now(), nextSlot) + spacingMs;
      if (wait) await sleep(wait);
      const params = new URLSearchParams({
        q: query,
        format: "jsonv2",
        limit: "5",
        "accept-language": lang === "ru" ? "ru,en" : "en",
      });
      const res = await doFetch(`${baseUrl}?${params}`, {
        headers: { "user-agent": USER_AGENT, accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`nominatim ${res.status}`);
      const places = (await res.json()) as NominatimPlace[];
      return {
        query,
        results: places.map(toResult),
        source: "nominatim",
        attribution: OSM_ATTRIBUTION,
      };
    } finally {
      queued--;
    }
  };

  return {
    async geocode(query, lang) {
      const key = `${lang}:${query.trim().toLowerCase()}`;
      const cached = cache.get(key);
      if (cached && cached.expires > now()) return { ...cached.response, query };

      let pending = inFlight.get(key);
      if (!pending) {
        if (queued >= maxQueue) return opts.fallback.geocode(query, lang);
        pending = request(query, lang)
          .then((response) => {
            if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
            cache.set(key, { response, expires: now() + cacheTtlMs });
            return response;
          })
          .catch((err: Error) => {
            opts.log?.warn({ err: err.message, query }, "nominatim failed, using local places");
            return opts.fallback.geocode(query, lang);
          })
          .finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
      }
      return { ...(await pending), query };
    },
  };
}
