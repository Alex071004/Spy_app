import {
  deadReckon,
  destinationPoint,
  normalizeLon,
  type GeoPoint,
  type TrackedObject,
} from "@spyapp/shared";

// Три штатных keyframe-интервала B1. Обрыв WS отдельно замораживает слой сразу.
export const MAX_PREDICTION_MS = 15_000;
const wrapLongitude = normalizeLon;
const predictionFor = (item: TrackedObject): Parameters<typeof deadReckon>[0] => ({
  position: item.position,
  updatedAt: item.updatedAt,
  ...(item.heading === undefined ? {} : { heading: item.heading }),
  ...(item.speed === undefined ? {} : { speed: item.speed }),
});

/** Большой круг: не перелетаем через полюс линейным сложением широты. */
export function projectPosition(
  position: GeoPoint,
  heading: number,
  speed: number,
  seconds: number,
  result: GeoPoint = { lon: 0, lat: 0 },
): GeoPoint {
  const next = destinationPoint(position, heading, speed * seconds);
  result.lon = next.lon;
  result.lat = next.lat;
  result.alt = position.alt ?? 0;
  return result;
}

/** Прогноз от времени измерения; плавная коррекция при новом keyframe. */
export class MotionTrack {
  private from: GeoPoint;
  private fromHeading: number;
  private receivedAt: number;
  private duration = 0;
  private sourceAge: number;
  private prediction: Parameters<typeof deadReckon>[0];
  readonly position: GeoPoint;
  heading: number;

  constructor(
    public item: TrackedObject,
    now: number,
    sourceNow = item.updatedAt,
  ) {
    this.from = { ...item.position };
    this.position = { ...item.position };
    this.heading = this.fromHeading = item.heading ?? 0;
    this.receivedAt = now;
    this.sourceAge = Math.max(0, sourceNow - item.updatedAt);
    this.prediction = predictionFor(item);
  }

  update(item: TrackedObject, now: number, sourceNow = item.updatedAt) {
    if (item.updatedAt <= this.item.updatedAt) return false;
    this.sample(now);
    this.from = { ...this.position };
    this.fromHeading = this.heading;
    this.duration = Math.min(1500, Math.max(100, item.updatedAt - this.item.updatedAt));
    this.item = item;
    this.prediction = predictionFor(item);
    this.receivedAt = now;
    this.sourceAge = Math.max(0, sourceNow - item.updatedAt);
    return true;
  }

  sample(now: number) {
    const elapsed = Math.max(0, now - this.receivedAt);
    const alpha = this.duration === 0 ? 1 : Math.min(1, elapsed / this.duration);
    const projected = deadReckon(
      this.prediction,
      this.item.updatedAt + Math.min(elapsed + this.sourceAge, MAX_PREDICTION_MS),
    );
    const lonDelta = wrapLongitude(projected.lon - this.from.lon);
    this.position.lon = wrapLongitude(this.from.lon + lonDelta * alpha);
    this.position.lat = this.from.lat + (projected.lat - this.from.lat) * alpha;
    this.position.alt =
      (this.from.alt ?? 0) + ((projected.alt ?? 0) - (this.from.alt ?? 0)) * alpha;
    const turn = wrapLongitude((this.item.heading ?? this.fromHeading) - this.fromHeading);
    this.heading = (((this.fromHeading + turn * alpha) % 360) + 360) % 360;
    return this.position;
  }

  isMoving(now: number) {
    return (
      now - this.receivedAt <
      Math.max(
        this.duration,
        this.item.heading !== undefined && (this.item.speed ?? 0) > 0
          ? Math.max(0, MAX_PREDICTION_MS - this.sourceAge)
          : 0,
      )
    );
  }
}
