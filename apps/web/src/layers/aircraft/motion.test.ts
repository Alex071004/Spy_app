import { describe, expect, it } from "vitest";
import { fixtureAircraft } from "@spyapp/shared/fixtures";
import { MotionTrack, projectPosition, MAX_PREDICTION_MS } from "./motion";
import { distanceM } from "@spyapp/shared";

const aircraft = fixtureAircraft[0]!;

describe("движение самолётов", () => {
  it("пересекает антимеридиан и сохраняет высоту", () => {
    const position = projectPosition({ lon: 179.999, lat: 0, alt: 10000 }, 90, 300, 3);
    expect(position.lon).toBeLessThan(-179.99);
    expect(position.lat).toBeCloseTo(0);
    expect(position.alt).toBe(10000);
  });

  it("остаётся на сфере при пересечении полюса", () => {
    const position = projectPosition({ lon: 0, lat: 89.999 }, 0, 300, 3);
    expect(Number.isFinite(position.lon)).toBe(true);
    expect(position.lat).toBeLessThanOrEqual(90);
    expect(position.lat).toBeGreaterThan(89.9);
  });

  it("сглаживает координаты и поворот по короткому пути без скачка", () => {
    const track = new MotionTrack(
      {
        ...aircraft,
        position: { lon: 179, lat: 0, alt: 10000 },
        heading: 350,
        speed: 0,
        updatedAt: 0,
      },
      0,
    );
    track.update(
      {
        ...aircraft,
        position: { lon: -179, lat: 2, alt: 12000 },
        heading: 10,
        speed: 0,
        updatedAt: 1000,
      },
      1000,
    );
    expect(track.sample(1000).lon).toBe(179);
    const halfway = track.sample(1500);
    expect(Math.abs(halfway.lon)).toBeCloseTo(180);
    expect(halfway.lat).toBeCloseTo(1);
    expect(halfway.alt).toBeCloseTo(11000);
    expect(track.heading).toBeCloseTo(0);
    expect(track.sample(2000).lon).toBeCloseTo(-179);
  });

  it("не откатывает объект устаревшими или повторными пакетами", () => {
    const track = new MotionTrack(aircraft, 0);
    expect(
      track.update(
        { ...aircraft, position: { lon: 100, lat: 0 }, updatedAt: aircraft.updatedAt - 1 },
        1000,
      ),
    ).toBe(false);
    expect(track.update(aircraft, 1000)).toBe(false);
    expect(track.item).toBe(aircraft);
  });

  it("ограничивает прогноз при потере потока и не выдумывает курс", () => {
    const track = new MotionTrack(aircraft, 0);
    const finalPosition = { ...track.sample(MAX_PREDICTION_MS) };
    expect(track.sample(60_000)).toEqual(finalPosition);
    expect(track.isMoving(60_000)).toBe(false);
    const withoutHeading = { ...aircraft };
    delete withoutHeading.heading;
    const unknownDirection = new MotionTrack(withoutHeading, 0);
    expect(unknownDirection.sample(2000).lon).toBeCloseTo(aircraft.position.lon);
    expect(unknownDirection.sample(2000).lat).toBeCloseTo(aircraft.position.lat);
    expect(unknownDirection.isMoving(1000)).toBe(false);
  });

  it("продолжает движение после 3 с и до следующего keyframe B1", () => {
    const track = new MotionTrack(aircraft, 0);
    const atThree = { ...track.sample(3000) };
    const atFour = { ...track.sample(4000) };
    expect(distanceM(atThree, atFour)).toBeCloseTo(aircraft.speed!, 1);
    expect(track.isMoving(4999)).toBe(true);
  });

  it("учитывает возраст измерения по серверному времени и не скачет на keyframe", () => {
    const track = new MotionTrack(aircraft, 0, aircraft.updatedAt + 2000);
    expect(distanceM(aircraft.position, track.sample(0))).toBeCloseTo(aircraft.speed! * 2, 1);
    const before = { ...track.sample(3000) };
    track.update(
      { ...aircraft, updatedAt: aircraft.updatedAt + 5000, position: before },
      3000,
      aircraft.updatedAt + 5000,
    );
    expect(distanceM(before, track.sample(3000))).toBeLessThan(0.01);
    expect(distanceM(before, track.sample(4000))).toBeGreaterThan(100);
  });
});
