import type { Connector } from "../../../../core/connector";
import { AIRPORTS } from "../simulator-data";
import { normalizeAdsbLol, type AdsbLolResponse } from "./normalize";
import { RADIUS_NM, buildCells, nextCell } from "./scheduler";

export interface AdsbLolOptions {
  baseUrl?: string;
  /** Потолок запросов в секунду. Фактическая частота подстраивается под ответы 429 */
  requestsPerSecond?: number;
  fetch?: typeof fetch;
  now?: () => number;
}

const USER_AGENT = "SpyApp/0.1 (+https://github.com/Alex071004/Spy_app)";
const REQUEST_TIMEOUT_MS = 10_000;
/** Пауза после 429/5xx, если сервер не прислал Retry-After */
const DEFAULT_BACKOFF_MS = 30_000;
const MIN_RPS = 0.1;
/** После стольких успешных запросов подряд пробуем ускориться на 25% */
const SPEEDUP_AFTER = 60;

/**
 * Реальные самолёты из adsb.lol (ODbL, атрибуция обязательна: docs/05-data-sources.md).
 * Опрашивает сетку кругов по 250 nm, загруженные и просматриваемые районы чаще.
 * Квота adsb.lol не опубликована, поэтому частота адаптивная: при 429 падает вдвое
 * и ждёт Retry-After, потом медленно растёт до потолка.
 */
export function createAdsbLolConnector(opts: AdsbLolOptions = {}): Connector {
  const baseUrl = opts.baseUrl ?? "https://api.adsb.lol";
  // Квота бесплатного API не опубликована; на 1 rps ловили 429 через ~10 с, на 0.5 — через минуту
  const maxRps = opts.requestsPerSecond ?? 0.5;
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const cells = buildCells(AIRPORTS);
  let rps = maxRps;
  let streak = 0;
  let pausedUntil = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  return {
    id: "adsb-lol",
    layer: "aircraft",
    start(ctx) {
      ctx.log.info({ cells: cells.length, maxRps }, "adsb.lol connector started");

      const throttle = (res: Response) => {
        const retryAfter = Number(res.headers.get("retry-after"));
        pausedUntil = now() + (retryAfter > 0 ? retryAfter * 1000 : DEFAULT_BACKOFF_MS);
        rps = Math.max(MIN_RPS, rps / 2);
        streak = 0;
        ctx.log.warn({ status: res.status, rps, retryAfter }, "adsb.lol throttled, slowing down");
      };

      const poll = async () => {
        const time = now();
        if (time < pausedUntil) return;
        const cell = nextCell(cells, time, ctx.views());
        if (!cell) return;
        cell.lastPollAt = time;
        const { lat, lon } = cell.center;
        const url = `${baseUrl}/v2/point/${lat.toFixed(2)}/${lon.toFixed(2)}/${RADIUS_NM}`;
        try {
          const res = await doFetch(url, {
            headers: { "user-agent": USER_AGENT, accept: "application/json" },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          });
          if (res.status === 429 || res.status >= 500) return throttle(res);
          if (!res.ok) {
            ctx.log.warn({ status: res.status, url }, "adsb.lol request failed");
            return;
          }
          const body = (await res.json()) as AdsbLolResponse;
          cell.count = body.ac.length;
          const items = normalizeAdsbLol(body);
          if (items.length) ctx.upsert(items);
          if (++streak >= SPEEDUP_AFTER && rps < maxRps) {
            rps = Math.min(maxRps, rps * 1.25);
            streak = 0;
          }
        } catch (err) {
          ctx.log.warn({ err: (err as Error).message, url }, "adsb.lol request error");
        }
      };

      // Запросы строго последовательные: следующий планируется после ответа на предыдущий
      const loop = async () => {
        await poll();
        if (!stopped) timer = setTimeout(() => void loop(), 1000 / rps);
      };
      void loop();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
