import { roundPoint, type AircraftProps, type TrackedObject } from "@spyapp/shared";

/** Борт в ответе adsb.lol (формат readsb / ADS-B Exchange v2). Только поля, которые мы читаем */
export interface AdsbLolAircraft {
  hex: string;
  flight?: string;
  r?: string;
  t?: string;
  /** Футы или "ground" */
  alt_baro?: number | "ground";
  alt_geom?: number;
  /** Узлы */
  gs?: number;
  track?: number;
  true_heading?: number;
  calc_track?: number;
  /** Футы в минуту */
  baro_rate?: number;
  geom_rate?: number;
  squawk?: string;
  emergency?: string;
  category?: string;
  lat?: number;
  lon?: number;
  /** Сколько секунд назад была позиция */
  seen_pos?: number;
  /** Битовые флаги базы: 1 военный, 2 интересный, 4 PIA, 8 LADD */
  dbFlags?: number;
}

export interface AdsbLolResponse {
  ac: AdsbLolAircraft[];
  /** Время ответа, unix ms */
  now: number;
}

const FT_TO_M = 0.3048;
const KT_TO_MS = 0.514444;
const FPM_TO_MS = FT_TO_M / 60;

const DB_MILITARY = 1;
/** PIA и LADD: владелец просил не показывать борт публично (docs/08-legal-ethics.md) */
const DB_PRIVACY = 4 | 8;

/** Позиции старше этого не берём: борт, скорее всего, уже вне зоны приёма */
const MAX_POSITION_AGE_S = 60;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Ответ adsb.lol → объекты слоя aircraft. Борта без позиции, устаревшие и приватные отбрасываются */
export function normalizeAdsbLol(response: AdsbLolResponse, source = "adsb-lol"): TrackedObject[] {
  const result: TrackedObject[] = [];
  for (const ac of response.ac) {
    if (ac.lat === undefined || ac.lon === undefined) continue;
    if ((ac.dbFlags ?? 0) & DB_PRIVACY) continue;
    if ((ac.seen_pos ?? 0) > MAX_POSITION_AGE_S) continue;

    const onGround = ac.alt_baro === "ground";
    const altFt = ac.alt_geom ?? (typeof ac.alt_baro === "number" ? ac.alt_baro : undefined);
    const heading = ac.track ?? ac.true_heading ?? ac.calc_track;
    const rate = ac.baro_rate ?? ac.geom_rate;
    const callsign = ac.flight?.trim();

    const props: AircraftProps = { onGround };
    if (callsign) props.callsign = callsign;
    if (ac.t) props.type = ac.t;
    if (ac.r) props.registration = ac.r;
    if (ac.squawk && /^[0-7]{4}$/.test(ac.squawk)) props.squawk = ac.squawk;
    if (ac.category) props.category = ac.category;
    if (rate !== undefined && !onGround) props.verticalRate = round1(rate * FPM_TO_MS);
    if (ac.emergency && ac.emergency !== "none") props.emergency = ac.emergency;
    if ((ac.dbFlags ?? 0) & DB_MILITARY) props.military = true;

    const position = roundPoint(
      onGround || altFt === undefined
        ? { lon: ac.lon, lat: ac.lat }
        : { lon: ac.lon, lat: ac.lat, alt: altFt * FT_TO_M },
    );

    result.push({
      id: `aircraft:${ac.hex.toLowerCase()}`,
      layer: "aircraft",
      position,
      ...(heading !== undefined ? { heading: round1(((heading % 360) + 360) % 360) % 360 } : {}),
      ...(ac.gs !== undefined ? { speed: round1(ac.gs * KT_TO_MS) } : {}),
      updatedAt: Math.round(response.now - (ac.seen_pos ?? 0) * 1000),
      source,
      props,
    });
  }
  return result;
}
