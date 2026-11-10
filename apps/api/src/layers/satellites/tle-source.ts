import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  SatellitesResponseSchema,
  type SatelliteGroup,
  type SatellitesResponse,
  type SatelliteTle,
} from "@spyapp/shared";
import { FIXTURE_GPS_TLE, FIXTURE_STATIONS_TLE } from "./fixtures";

export interface SatelliteSource {
  get(group: SatelliteGroup): Promise<SatellitesResponse>;
}

/** Наши группы → GROUP у CelesTrak */
const CELESTRAK_GROUPS: Record<SatelliteGroup, string> = {
  stations: "stations",
  visual: "visual",
  gps: "gps-ops",
  glonass: "glo-ops",
  galileo: "galileo",
  weather: "weather",
  starlink: "starlink",
  active: "active",
};

/** Набор TLE в тексте (имя + 2 строки) → записи. Битые тройки пропускаются */
export function parseTle(text: string): SatelliteTle[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const result: SatelliteTle[] = [];
  for (let i = 0; i + 2 < lines.length;) {
    const [name, line1, line2] = [lines[i]!, lines[i + 1]!.trimEnd(), lines[i + 2]!.trimEnd()];
    if (
      line1.startsWith("1 ") &&
      line2.startsWith("2 ") &&
      line1.length === 69 &&
      line2.length === 69
    ) {
      result.push({ noradId: Number(line1.slice(2, 7)), name: name.trim(), line1, line2 });
      i += 3;
    } else {
      i += 1;
    }
  }
  return result;
}

/** SIMULATE=1 и тесты: встроенные TLE без сети */
export function createFixtureSatellites(now: () => number = Date.now): SatelliteSource {
  const stations = parseTle(FIXTURE_STATIONS_TLE);
  const gps = parseTle(FIXTURE_GPS_TLE);
  return {
    async get(group) {
      const satellites =
        group === "stations" ? stations : group === "gps" ? gps : [...stations, ...gps];
      return { group, fetchedAt: now(), source: "fixture", satellites };
    },
  };
}

export interface CelestrakOptions {
  /** Папка файлового кэша: рестарты сервера не должны заново качать CelesTrak */
  cacheDir: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  now?: () => number;
  /** Сколько считать набор свежим. CelesTrak обновляет данные раз в несколько часов */
  ttlMs?: number;
  /** После неудачной загрузки не пробовать снова раньше этого */
  retryMs?: number;
  log?: { warn(obj: object, msg: string): void };
}

const USER_AGENT = "SpyApp/0.1 (+https://github.com/Alex071004/Spy_app)";
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * TLE с CelesTrak. Правило CelesTrak: не качать одну группу чаще раза в ~2 часа, иначе блокировка.
 * Поэтому кэш 6 ч в памяти и на диске, а при сбое отдаём последний известный набор.
 */
export function createCelestrakSatellites(opts: CelestrakOptions): SatelliteSource {
  const baseUrl = opts.baseUrl ?? "https://celestrak.org/NORAD/elements/gp.php";
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const ttlMs = opts.ttlMs ?? 6 * 60 * 60_000;
  const retryMs = opts.retryMs ?? 10 * 60_000;
  const memory = new Map<SatelliteGroup, SatellitesResponse>();
  const lastFailure = new Map<SatelliteGroup, number>();
  const inFlight = new Map<SatelliteGroup, Promise<SatellitesResponse>>();
  const file = (group: SatelliteGroup) => join(opts.cacheDir, `celestrak-${group}.json`);

  const readDisk = async (group: SatelliteGroup) => {
    try {
      const parsed = SatellitesResponseSchema.safeParse(
        JSON.parse(await readFile(file(group), "utf8")),
      );
      return parsed.success ? parsed.data : undefined;
    } catch {
      return undefined;
    }
  };

  const download = async (group: SatelliteGroup): Promise<SatellitesResponse> => {
    const url = `${baseUrl}?GROUP=${CELESTRAK_GROUPS[group]}&FORMAT=tle`;
    const res = await doFetch(url, {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`celestrak ${res.status}`);
    const satellites = parseTle(await res.text());
    if (satellites.length === 0) throw new Error("celestrak returned no TLE");
    const data: SatellitesResponse = { group, fetchedAt: now(), source: "celestrak", satellites };
    await mkdir(opts.cacheDir, { recursive: true });
    await writeFile(file(group), JSON.stringify(data));
    return data;
  };

  const load = async (group: SatelliteGroup): Promise<SatellitesResponse> => {
    const known = memory.get(group) ?? (await readDisk(group));
    if (known) memory.set(group, known);
    if (known && now() - known.fetchedAt < ttlMs) return known;
    if (known && now() - (lastFailure.get(group) ?? 0) < retryMs) return known;
    try {
      const fresh = await download(group);
      memory.set(group, fresh);
      return fresh;
    } catch (err) {
      lastFailure.set(group, now());
      opts.log?.warn({ err: (err as Error).message, group }, "celestrak download failed");
      if (known) return known;
      throw err;
    }
  };

  return {
    get(group) {
      let pending = inFlight.get(group);
      if (!pending) {
        pending = load(group).finally(() => inFlight.delete(group));
        inFlight.set(group, pending);
      }
      return pending;
    },
  };
}
