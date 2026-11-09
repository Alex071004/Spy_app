import type { GeoPoint, TrackedObject } from "@spyapp/shared";

const RADIUS = 6_371_008.8;
const RAD = Math.PI / 180;
export const MAX_PREDICTION_MS = 3000;
const wrapLongitude = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

/** Большой круг: не перелетаем через полюс линейным сложением широты. */
export function projectPosition(
  position: GeoPoint,
  heading: number,
  speed: number,
  seconds: number,
  result: GeoPoint = { lon: 0, lat: 0 },
): GeoPoint {
  const distance = (speed * seconds) / RADIUS;
  const lat = position.lat * RAD;
  const bearing = heading * RAD;
  const nextLat = Math.asin(
    Math.max(
      -1,
      Math.min(
        1,
        Math.sin(lat) * Math.cos(distance) + Math.cos(lat) * Math.sin(distance) * Math.cos(bearing),
      ),
    ),
  );
  const nextLon =
    position.lon * RAD +
    Math.atan2(
      Math.sin(bearing) * Math.sin(distance) * Math.cos(lat),
      Math.cos(distance) - Math.sin(lat) * Math.sin(nextLat),
    );
  result.lon = wrapLongitude(nextLon / RAD);
  result.lat = nextLat / RAD;
  result.alt = position.alt ?? 0;
  return result;
}

/** Между измерениями сглаживаем поправку и ограничиваем прогноз тремя секундами. */
export class MotionTrack {
  private from: GeoPoint;
  private fromHeading: number;
  private receivedAt: number;
  private duration = 0;
  private readonly projected: GeoPoint = { lon: 0, lat: 0 };
  readonly position: GeoPoint;
  heading: number;

  constructor(
    public item: TrackedObject,
    now: number,
  ) {
    this.from = { ...item.position };
    this.position = { ...item.position };
    this.heading = this.fromHeading = item.heading ?? 0;
    this.receivedAt = now;
  }

  update(item: TrackedObject, now: number) {
    if (item.updatedAt <= this.item.updatedAt) return false;
    this.sample(now);
    this.from = { ...this.position };
    this.fromHeading = this.heading;
    this.duration = Math.min(1500, Math.max(100, item.updatedAt - this.item.updatedAt));
    this.item = item;
    this.receivedAt = now;
    return true;
  }

  sample(now: number) {
    const elapsed = Math.max(0, now - this.receivedAt);
    const alpha = this.duration === 0 ? 1 : Math.min(1, elapsed / this.duration);
    projectPosition(
      this.item.position,
      this.item.heading ?? this.fromHeading,
      this.item.heading === undefined ? 0 : (this.item.speed ?? 0),
      Math.min(elapsed, MAX_PREDICTION_MS) / 1000,
      this.projected,
    );
    const lonDelta = wrapLongitude(this.projected.lon - this.from.lon);
    this.position.lon = wrapLongitude(this.from.lon + lonDelta * alpha);
    this.position.lat = this.from.lat + (this.projected.lat - this.from.lat) * alpha;
    this.position.alt =
      (this.from.alt ?? 0) + ((this.projected.alt ?? 0) - (this.from.alt ?? 0)) * alpha;
    const turn = wrapLongitude((this.item.heading ?? this.fromHeading) - this.fromHeading);
    this.heading = (((this.fromHeading + turn * alpha) % 360) + 360) % 360;
    return this.position;
  }

  isMoving(now: number) {
    return (
      now - this.receivedAt <
      Math.max(
        this.duration,
        this.item.heading !== undefined && (this.item.speed ?? 0) > 0 ? MAX_PREDICTION_MS : 0,
      )
    );
  }
}
