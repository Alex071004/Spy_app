/**
 * Список бортов, владельцы которых просили не показывать их публично (FAA LADD и PIA).
 * adsb.lol сам помечает такие борта, а у других источников (OpenSky) пометок нет:
 * для них берём актуальный список у adsb.lol (docs/08-legal-ethics.md).
 */
export interface PrivacyList {
  isHidden(hex: string): boolean;
  /** Запускает обновление; промис завершается после первой загрузки (успешной или нет) */
  start(): Promise<void>;
  stop(): void;
}

export interface PrivacyListOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  refreshMs?: number;
  log?: { warn(obj: object, msg: string): void };
}

const USER_AGENT = "SpyApp/0.1 (+https://github.com/Alex071004/Spy_app)";

export function createAdsbLolPrivacyList(opts: PrivacyListOptions = {}): PrivacyList {
  const baseUrl = opts.baseUrl ?? "https://api.adsb.lol";
  const doFetch = opts.fetch ?? fetch;
  const refreshMs = opts.refreshMs ?? 10 * 60_000;
  let hidden = new Set<string>();
  let timer: ReturnType<typeof setInterval> | undefined;

  const refresh = async () => {
    try {
      const next = new Set<string>();
      for (const list of ["ladd", "pia"]) {
        const res = await doFetch(`${baseUrl}/v2/${list}`, {
          headers: { "user-agent": USER_AGENT, accept: "application/json" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`adsb.lol ${list} ${res.status}`);
        const body = (await res.json()) as { ac: { hex: string }[] };
        for (const ac of body.ac) next.add(ac.hex.toLowerCase());
      }
      hidden = next;
    } catch (err) {
      // Оставляем прошлый список: лучше чуть устаревший, чем пустой
      opts.log?.warn({ err: (err as Error).message }, "privacy list refresh failed");
    }
  };

  return {
    isHidden: (hex) => hidden.has(hex.toLowerCase()),
    start() {
      timer = setInterval(() => void refresh(), refreshMs);
      return refresh();
    },
    stop() {
      clearInterval(timer);
    },
  };
}
