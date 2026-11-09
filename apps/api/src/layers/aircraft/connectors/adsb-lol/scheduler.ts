import { bboxContains, distanceM, type BBox, type GeoPoint } from "@spyapp/shared";

/**
 * Планировщик опроса adsb.lol. API отдаёт круг радиусом до 250 морских миль, поэтому
 * планета покрыта сеткой кругов, а частота опроса каждого круга зависит от того,
 * сколько там бортов и смотрит ли туда кто-то из клиентов.
 */

export const RADIUS_NM = 250;
const RADIUS_M = RADIUS_NM * 1852;
/** Шаг сетки чуть меньше √3·R: соседние круги перекрываются без дыр */
const STEP_DEG = 7;
const LAT_MIN = -56;
const LAT_MAX = 74;

export interface Cell {
  center: GeoPoint;
  /** Сколько бортов было в прошлый раз (до первого опроса: оценка по аэропортам) */
  count: number;
  lastPollAt: number;
}

/** Как часто опрашивать круг с таким числом бортов */
export function intervalFor(count: number) {
  if (count >= 150) return 15_000;
  if (count >= 40) return 30_000;
  if (count >= 5) return 60_000;
  if (count > 0) return 120_000;
  return 600_000;
}

/** Клетка в области, которую смотрит клиент, обновляется во столько раз чаще */
const IN_VIEW_BOOST = 4;

export function buildCells(hotspots: readonly GeoPoint[]): Cell[] {
  const cells: Cell[] = [];
  for (let lat = LAT_MIN; lat <= LAT_MAX; lat += STEP_DEG) {
    const lonStep = STEP_DEG / Math.max(0.3, Math.cos((lat * Math.PI) / 180));
    const count = Math.max(1, Math.round(360 / lonStep));
    // Сдвиг через полосу даёт шахматную укладку и лучшее покрытие
    const offset = (Math.round((lat - LAT_MIN) / STEP_DEG) % 2) * (180 / count);
    for (let i = 0; i < count; i++) {
      const center = { lon: -180 + offset + (i * 360) / count, lat };
      // Пока не опросили, считаем круг с крупными аэропортами загруженным: он пойдёт первым
      const near = hotspots.filter((h) => distanceM(h, center) < RADIUS_M * 1.5).length;
      cells.push({ center, count: near * 50, lastPollAt: 0 });
    }
  }
  return cells;
}

function inView(cell: Cell, views: readonly BBox[]) {
  // Круг задевает рамку: проверяем центр по рамке, расширенной на радиус круга
  const pad = (RADIUS_M / 111_000) * 1.2;
  return views.some(([w, s, e, n]) =>
    bboxContains([w - pad, s - pad, e + pad, n + pad], cell.center.lon, cell.center.lat),
  );
}

/**
 * Какой круг опросить следующим: наибольшее «опоздание» относительно своего интервала.
 * Возвращает undefined, если всё свежее.
 */
export function nextCell(cells: readonly Cell[], now: number, views: readonly BBox[] = []) {
  let best: Cell | undefined;
  let bestScore = 1;
  for (const cell of cells) {
    let score = (now - cell.lastPollAt) / intervalFor(cell.count);
    if (views.length && inView(cell, views)) score *= IN_VIEW_BOOST;
    if (score >= bestScore) {
      best = cell;
      bestScore = score;
    }
  }
  return best;
}
