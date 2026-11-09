import type { BBox, GeoPoint } from "./model";

// Геометрия на сфере для сервера и клиента (интерполяция, маршруты, фильтр по области).

export const EARTH_RADIUS_M = 6_371_000;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Долгота в диапазоне [-180, 180) */
export function normalizeLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** Округление координат: 5 знаков ≈ 1 м, короче JSON без заметной потери точности */
export function roundPoint(p: GeoPoint, digits = 5): GeoPoint {
  const k = 10 ** digits;
  const rounded = { lon: Math.round(p.lon * k) / k, lat: Math.round(p.lat * k) / k };
  return p.alt === undefined ? rounded : { ...rounded, alt: Math.round(p.alt) };
}

/** Попадает ли точка в рамку. Учитывает рамки через антимеридиан (west > east) */
export function bboxContains([west, south, east, north]: BBox, lon: number, lat: number): boolean {
  if (lat < south || lat > north) return false;
  return west <= east ? lon >= west && lon <= east : lon >= west || lon <= east;
}

/** Расстояние по большому кругу, метры */
export function distanceM(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Начальный курс из a в b, градусы [0, 360) */
export function bearingDeg(a: GeoPoint, b: GeoPoint): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lon - a.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Точка, в которую придёшь из start, пройдя distance метров курсом heading */
export function destinationPoint(start: GeoPoint, headingDeg: number, distance: number): GeoPoint {
  const δ = distance / EARTH_RADIUS_M;
  const θ = toRad(headingDeg);
  const φ1 = toRad(start.lat);
  const λ1 = toRad(start.lon);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 +
    Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lon: normalizeLon(toDeg(λ2)), lat: toDeg(φ2) };
}

/** Точка на большом круге между a и b, fraction в [0, 1] */
export function interpolateGreatCircle(a: GeoPoint, b: GeoPoint, fraction: number): GeoPoint {
  const δ = distanceM(a, b) / EARTH_RADIUS_M;
  if (δ === 0) return { lon: a.lon, lat: a.lat };
  const φ1 = toRad(a.lat);
  const λ1 = toRad(a.lon);
  const φ2 = toRad(b.lat);
  const λ2 = toRad(b.lon);
  const k1 = Math.sin((1 - fraction) * δ) / Math.sin(δ);
  const k2 = Math.sin(fraction * δ) / Math.sin(δ);
  const x = k1 * Math.cos(φ1) * Math.cos(λ1) + k2 * Math.cos(φ2) * Math.cos(λ2);
  const y = k1 * Math.cos(φ1) * Math.sin(λ1) + k2 * Math.cos(φ2) * Math.sin(λ2);
  const z = k1 * Math.sin(φ1) + k2 * Math.sin(φ2);
  return { lon: toDeg(Math.atan2(y, x)), lat: toDeg(Math.atan2(z, Math.hypot(x, y))) };
}

/**
 * Где объект сейчас, если с момента updatedAt он шёл тем же курсом и скоростью.
 * Нужна клиенту для плавного движения между дельтами.
 */
export function deadReckon(
  obj: { position: GeoPoint; heading?: number; speed?: number; updatedAt: number },
  now: number,
): GeoPoint {
  if (obj.heading === undefined || !obj.speed) return obj.position;
  const elapsed = Math.max(0, (now - obj.updatedAt) / 1000);
  const next = destinationPoint(obj.position, obj.heading, obj.speed * elapsed);
  return obj.position.alt === undefined ? next : { ...next, alt: obj.position.alt };
}
