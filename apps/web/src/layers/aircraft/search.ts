import { AircraftPropsSchema, type TrackedObject } from "@spyapp/shared";

const propsSchema = AircraftPropsSchema.partial();
const fieldsCache = new WeakMap<TrackedObject, string[]>();
function fieldsFor(object: TrackedObject) {
  const cached = fieldsCache.get(object);
  if (cached) return cached;
  const parsed = propsSchema.safeParse(object.props);
  const fields = [
    object.id,
    ...(parsed.success ? [parsed.data.callsign ?? "", parsed.data.registration ?? ""] : []),
  ].map((field) => field.trim().toLowerCase());
  fieldsCache.set(object, fields);
  return fields;
}
function rank(object: TrackedObject, needle: string) {
  const fields = fieldsFor(object);
  return !needle
    ? 4
    : fields[0] === needle
      ? 0
      : fields.includes(needle)
        ? 1
        : fields.some((field) => field.startsWith(needle))
          ? 2
          : fields.some((field) => field.includes(needle))
            ? 3
            : -1;
}
export function aircraftLabel(object: TrackedObject) {
  const result = propsSchema.safeParse(object.props);
  return result.success
    ? result.data.callsign?.trim() || result.data.registration || object.id
    : object.id;
}

/** Только загруженные объекты. В React попадают максимум восемь результатов. */
export function searchAircraft(objects: Iterable<TrackedObject>, query: string, limit = 8) {
  const needle = query.trim().toLowerCase();
  const matches: { object: TrackedObject; score: number }[] = [];
  for (const object of objects) {
    const score = rank(object, needle);
    if (score !== -1) matches.push({ object, score });
  }
  return matches
    .sort((a, b) => a.score - b.score || a.object.id.localeCompare(b.object.id))
    .slice(0, limit)
    .map(({ object }) => object);
}

export function resolveAircraft(objects: Iterable<TrackedObject>, query: string) {
  const matches = searchAircraft(objects, query, 2);
  const first = matches[0];
  if (!first || !query.trim()) return undefined;
  const second = matches[1];
  return !second ||
    rank(first, query.trim().toLowerCase()) < rank(second, query.trim().toLowerCase())
    ? first
    : undefined;
}
