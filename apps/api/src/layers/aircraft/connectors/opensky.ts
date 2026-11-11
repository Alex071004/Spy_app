import { roundPoint, type AircraftProps, type TrackedObject } from "@spyapp/shared";
import type { Connector } from "../../../core/connector";
import type { PrivacyList } from "../privacy";

/**
 * Вектор состояния OpenSky (/states/all?extended=1): массив, порядок полей фиксирован.
 * https://openskynetwork.github.io/opensky-api/rest.html
 */
type StateVector = [
  icao24: string,
  callsign: string | null,
  originCountry: string,
  timePosition: number | null,
  lastContact: number,
  longitude: number | null,
  latitude: number | null,
  baroAltitude: number | null,
  onGround: boolean,
  velocity: number | null,
  trueTrack: number | null,
  verticalRate: number | null,
  sensors: number[] | null,
  geoAltitude: number | null,
  squawk: string | null,
  spi: boolean,
  positionSource: number,
  category?: number,
];

export interface OpenSkyResponse {
  time: number;
  states: StateVector[] | null;
}

/** Категория OpenSky → категория ADS-B, как у adsb.lol */
const CATEGORY: Record<number, string> = {
  2: "A1",
  3: "A2",
  4: "A3",
  5: "A4",
  6: "A5",
  7: "A6",
  8: "A7",
  9: "B1",
  10: "B2",
  11: "B3",
  12: "B4",
  14: "B6",
  15: "B7",
  16: "C1",
  17: "C2",
  18: "C3",
  19: "C4",
  20: "C5",
};

/** Позиции старше этого не берём */
const MAX_POSITION_AGE_S = 120;

const round1 = (n: number) => Math.round(n * 10) / 10;

export function normalizeOpenSky(
  response: OpenSkyResponse,
  privacy?: Pick<PrivacyList, "isHidden">,
): TrackedObject[] {
  const result: TrackedObject[] = [];
  for (const s of response.states ?? []) {
    const [
      hex,
      callsign,
      country,
      timePosition,
      ,
      lon,
      lat,
      baroAlt,
      onGround,
      velocity,
      track,
      vRate,
      ,
      geoAlt,
      squawk,
      ,
      ,
      category,
    ] = s;
    if (lon === null || lat === null || timePosition === null) continue;
    if (response.time - timePosition > MAX_POSITION_AGE_S) continue;
    if (privacy?.isHidden(hex)) continue;

    const props: AircraftProps = { onGround, country };
    const cs = callsign?.trim();
    if (cs) props.callsign = cs;
    if (squawk && /^[0-7]{4}$/.test(squawk)) props.squawk = squawk;
    if (category !== undefined && CATEGORY[category]) props.category = CATEGORY[category];
    if (vRate !== null && !onGround) props.verticalRate = round1(vRate);

    const alt = geoAlt ?? baroAlt;
    result.push({
      id: `aircraft:${hex.toLowerCase()}`,
      layer: "aircraft",
      position: roundPoint(onGround || alt === null ? { lon, lat } : { lon, lat, alt }),
      ...(track !== null ? { heading: round1(((track % 360) + 360) % 360) % 360 } : {}),
      ...(velocity !== null ? { speed: round1(velocity) } : {}),
      updatedAt: timePosition * 1000,
      source: "opensky",
      props,
    });
  }
  return result;
}

export interface OpenSkyOptions {
  /** API-клиент OpenSky (бесплатный аккаунт): квота в 10 раз больше, чем анонимно */
  clientId?: string | undefined;
  clientSecret?: string | undefined;
  privacy?: PrivacyList;
  baseUrl?: string;
  tokenUrl?: string;
  fetch?: typeof fetch;
  now?: () => number;
}

const USER_AGENT = "SpyApp/0.1 (+https://github.com/Alex071004/Spy_app)";
const DEFAULT_TOKEN_URL =
  "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
/**
 * /states/all стоит 4 кредита. Анонимно 400 кредитов в сутки (100 запросов, раз в ~15 мин),
 * с аккаунтом 4000 (1000 запросов, раз в ~90 с). Интервалы с запасом
 */
const ANONYMOUS_INTERVAL_MS = 15 * 60_000;
const ACCOUNT_INTERVAL_MS = 90_000;

/** Сколько держать борт без обновлений: интервал опроса плюс запас на одну неудачу */
export const openSkyTtlMs = (authenticated: boolean) =>
  (authenticated ? ACCOUNT_INTERVAL_MS : ANONYMOUS_INTERVAL_MS) * 2;

/**
 * Глобальный фон из OpenSky Network: весь мир одним запросом.
 * Только некоммерческое использование (docs/05-data-sources.md).
 * adsb.lol параллельно даёт свежие данные там, куда смотрят клиенты.
 */
export function createOpenSkyConnector(
  opts: OpenSkyOptions = {},
): Connector & { authenticated: boolean } {
  const baseUrl = opts.baseUrl ?? "https://opensky-network.org/api";
  const tokenUrl = opts.tokenUrl ?? DEFAULT_TOKEN_URL;
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const authenticated = Boolean(opts.clientId && opts.clientSecret);
  const intervalMs = authenticated ? ACCOUNT_INTERVAL_MS : ANONYMOUS_INTERVAL_MS;
  let token: { value: string; expires: number } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const authHeader = async (): Promise<Record<string, string>> => {
    if (!authenticated) return {};
    if (!token || token.expires <= now()) {
      const res = await doFetch(tokenUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": USER_AGENT },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: opts.clientId!,
          client_secret: opts.clientSecret!,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`opensky token ${res.status}`);
      const body = (await res.json()) as { access_token: string; expires_in: number };
      // Обновляем за минуту до истечения
      token = { value: body.access_token, expires: now() + (body.expires_in - 60) * 1000 };
    }
    return { authorization: `Bearer ${token.value}` };
  };

  return {
    id: "opensky",
    layer: "aircraft",
    authenticated,
    ttlMs: openSkyTtlMs(authenticated),
    start(ctx) {
      // Первый запрос только после загрузки списка приватности, иначе скрытые борта успеют показаться
      const privacyReady = opts.privacy?.start() ?? Promise.resolve();
      ctx.log.info({ authenticated, intervalS: intervalMs / 1000 }, "opensky connector started");

      const poll = async (): Promise<number> => {
        try {
          const res = await doFetch(`${baseUrl}/states/all?extended=1`, {
            headers: {
              ...(await authHeader()),
              "user-agent": USER_AGENT,
              accept: "application/json",
            },
            signal: AbortSignal.timeout(60_000),
          });
          if (res.status === 429) {
            const retry = Number(res.headers.get("x-rate-limit-retry-after-seconds"));
            ctx.log.warn({ retryAfterS: retry }, "opensky daily quota exhausted");
            return retry > 0 ? retry * 1000 : intervalMs;
          }
          if (res.status === 401) token = undefined;
          if (!res.ok) throw new Error(`opensky ${res.status}`);
          const items = normalizeOpenSky((await res.json()) as OpenSkyResponse, opts.privacy);
          if (items.length) ctx.upsert(items);
          ctx.log.info(
            { aircraft: items.length, remaining: res.headers.get("x-rate-limit-remaining") },
            "opensky update",
          );
        } catch (err) {
          ctx.log.warn({ err: (err as Error).message }, "opensky request failed");
        }
        return intervalMs;
      };

      const loop = async () => {
        await privacyReady;
        const next = await poll();
        if (!stopped) timer = setTimeout(() => void loop(), next);
      };
      void loop();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      opts.privacy?.stop();
    },
  };
}
