import { describe, expect, it } from "vitest";
import {
  bboxContains,
  bearingDeg,
  deadReckon,
  destinationPoint,
  distanceM,
  interpolateGreatCircle,
  normalizeLon,
} from "./geo";

const moscow = { lon: 37.6173, lat: 55.7558 };
const london = { lon: -0.1276, lat: 51.5072 };

describe("geo", () => {
  it("нормализует долготу", () => {
    expect(normalizeLon(190)).toBeCloseTo(-170);
    expect(normalizeLon(-190)).toBeCloseTo(170);
    expect(normalizeLon(45)).toBeCloseTo(45);
  });

  it("проверяет попадание в рамку, в том числе через антимеридиан", () => {
    expect(bboxContains([-10, 40, 10, 60], 0, 50)).toBe(true);
    expect(bboxContains([-10, 40, 10, 60], 20, 50)).toBe(false);
    expect(bboxContains([170, -10, -170, 10], 179, 0)).toBe(true);
    expect(bboxContains([170, -10, -170, 10], -175, 0)).toBe(true);
    expect(bboxContains([170, -10, -170, 10], 0, 0)).toBe(false);
  });

  it("считает расстояние Москва — Лондон около 2500 км", () => {
    expect(distanceM(moscow, london) / 1000).toBeCloseTo(2500, -2);
  });

  it("destinationPoint обратен к bearing + distance", () => {
    const d = distanceM(moscow, london);
    const p = destinationPoint(moscow, bearingDeg(moscow, london), d);
    expect(distanceM(p, london)).toBeLessThan(10);
  });

  it("интерполяция по большому кругу даёт концы и середину на равном расстоянии", () => {
    expect(distanceM(interpolateGreatCircle(moscow, london, 0), moscow)).toBeLessThan(1);
    expect(distanceM(interpolateGreatCircle(moscow, london, 1), london)).toBeLessThan(1);
    const mid = interpolateGreatCircle(moscow, london, 0.5);
    expect(distanceM(mid, moscow)).toBeCloseTo(distanceM(mid, london), -1);
  });

  it("deadReckon сдвигает объект по курсу и скорости", () => {
    const obj = {
      position: { lon: 0, lat: 0, alt: 10_000 },
      heading: 90,
      speed: 250,
      updatedAt: 0,
    };
    const p = deadReckon(obj, 10_000);
    expect(distanceM(p, obj.position)).toBeCloseTo(2500, -1);
    expect(p.lon).toBeGreaterThan(0);
    expect(p.alt).toBe(10_000);
  });
});
