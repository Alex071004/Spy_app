import type { ObjectPhoto } from "@spyapp/shared";

/** Источник фото самолёта по hex-коду транспондера или регистрации */
export interface AircraftPhotoProvider {
  find(hex: string, registration?: string): Promise<ObjectPhoto | null>;
}

interface PlanespottersResponse {
  photos: {
    thumbnail: { src: string };
    thumbnail_large?: { src: string };
    link: string;
    photographer: string;
  }[];
}

export interface PlanespottersOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  now?: () => number;
  /** Сколько держать ответ (и отсутствие фото) в памяти. Planespotters отдаёт Cache-Control: max-age=3600 */
  ttlMs?: number;
  maxEntries?: number;
}

const USER_AGENT = "SpyApp/0.1 (+https://github.com/Alex071004/Spy_app)";
const REQUEST_TIMEOUT_MS = 4_000;

/**
 * Фото с Planespotters.net. Картинки не копируем: отдаём их URL, подпись автора и ссылку
 * на страницу фото (docs/05-data-sources.md). Ответы кэшируются, одинаковые запросы склеиваются.
 */
export function createPlanespottersPhotos(opts: PlanespottersOptions = {}): AircraftPhotoProvider {
  const baseUrl = opts.baseUrl ?? "https://api.planespotters.net/pub/photos";
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const ttlMs = opts.ttlMs ?? 60 * 60_000;
  const maxEntries = opts.maxEntries ?? 5_000;
  const cache = new Map<string, { photo: ObjectPhoto | null; expires: number }>();
  const inFlight = new Map<string, Promise<ObjectPhoto | null>>();

  const request = async (path: string): Promise<ObjectPhoto | null> => {
    const res = await doFetch(`${baseUrl}/${path}`, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`planespotters ${res.status}`);
    const first = ((await res.json()) as PlanespottersResponse).photos[0];
    if (!first) return null;
    return {
      thumbnailUrl: first.thumbnail.src,
      ...(first.thumbnail_large ? { largeUrl: first.thumbnail_large.src } : {}),
      pageUrl: first.link,
      photographer: first.photographer,
      source: "planespotters",
    };
  };

  const lookup = async (hex: string, registration?: string) => {
    const byHex = await request(`hex/${encodeURIComponent(hex)}`);
    if (byHex || !registration) return byHex;
    return request(`reg/${encodeURIComponent(registration)}`);
  };

  return {
    async find(hex, registration) {
      const key = hex.toLowerCase();
      const cached = cache.get(key);
      if (cached && cached.expires > now()) return cached.photo;

      let pending = inFlight.get(key);
      if (!pending) {
        pending = lookup(key, registration)
          .then((photo) => {
            if (cache.size >= maxEntries) cache.delete(cache.keys().next().value!);
            cache.set(key, { photo, expires: now() + ttlMs });
            return photo;
          })
          .finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
      }
      return pending;
    },
  };
}
