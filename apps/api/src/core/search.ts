import type { LayerId, SearchResult, TrackedObject } from "@spyapp/shared";
import type { Airport } from "../layers/aircraft/airports";
import type { WorldStateReader } from "./world-state";

/** По каким полям props ищем объекты слоя: идентифицирующие и общие (тип совпадает у сотен бортов) */
const SEARCH_FIELDS: Partial<
  Record<LayerId, { identity: readonly string[]; common: readonly string[] }>
> = {
  aircraft: { identity: ["callsign", "registration"], common: ["type"] },
  vessels: { identity: ["name", "mmsi"], common: [] },
};
/** Совпадение по общему полю ранжируется ниже, чем по идентифицирующему */
const COMMON_FIELD_PENALTY = 1.5;

/** Чем точнее совпадение, тем выше: точное > с начала > внутри строки */
function score(value: string, query: string): number {
  const v = value.toLowerCase();
  if (v === query) return 3;
  if (v.startsWith(query)) return 2;
  if (query.length >= 3 && v.includes(query)) return 1;
  return 0;
}

function describeObject(obj: TrackedObject): Pick<SearchResult, "label" | "description"> {
  const p = obj.props;
  const str = (key: string) => (typeof p[key] === "string" ? (p[key] as string) : undefined);
  const label =
    str("callsign") ?? str("name") ?? str("registration") ?? obj.id.split(":")[1] ?? obj.id;
  const description = [str("type") ?? str("shipType"), str("registration") ?? str("flag")]
    .filter((s) => s && s !== label)
    .join(" · ");
  return description ? { label, description } : { label };
}

export interface SearchOptions {
  limit?: number;
}

/**
 * Поиск по live-объектам и местам. Линейный проход по состоянию мира:
 * на 15k объектов это единицы миллисекунд, индекс не нужен.
 */
export function search(
  world: WorldStateReader,
  places: readonly Airport[],
  rawQuery: string,
  { limit = 20 }: SearchOptions = {},
): SearchResult[] {
  const query = rawQuery.trim().toLowerCase();
  if (query.length < 2) return [];
  const scored: { score: number; result: SearchResult }[] = [];

  const fieldScore = (obj: TrackedObject, fields: readonly string[]) =>
    fields.reduce((best, field) => {
      const value = obj.props[field];
      return typeof value === "string" ? Math.max(best, score(value, query)) : best;
    }, 0);

  for (const [layer, fields] of Object.entries(SEARCH_FIELDS) as [
    LayerId,
    { identity: readonly string[]; common: readonly string[] },
  ][]) {
    for (const obj of world.values(layer)) {
      const hex = obj.id.slice(obj.id.indexOf(":") + 1);
      const identity = Math.max(hex === query ? 3 : 0, fieldScore(obj, fields.identity));
      const common = fieldScore(obj, fields.common);
      const best = Math.max(identity, common > 0 ? common - COMMON_FIELD_PENALTY : 0);
      if (best > 0) {
        scored.push({
          score: best,
          result: {
            kind: "object",
            id: obj.id,
            layer,
            ...describeObject(obj),
            position: obj.position,
          },
        });
      }
    }
  }

  for (const place of places) {
    const best = Math.max(
      score(place.code, query),
      score(place.city, query),
      score(place.cityRu, query),
    );
    if (best > 0) {
      scored.push({
        // Город — частый запрос для goto: при равном совпадении место выше случайного борта
        score: best + 0.5,
        result: {
          kind: "place",
          id: `airport:${place.code}`,
          label: place.city,
          description: `${place.cityRu} · ${place.code}`,
          position: { lon: place.lon, lat: place.lat },
        },
      });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score || a.result.label.localeCompare(b.result.label))
    .slice(0, limit)
    .map((s) => s.result);
}
