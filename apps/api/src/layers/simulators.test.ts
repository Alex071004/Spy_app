import { describe, expect, it, vi } from "vitest";
import { TrackedObjectSchema, distanceM, type TrackedObject } from "@spyapp/shared";
import type { ConnectorContext } from "../core/connector";
import { createAircraftSimulator } from "./aircraft/connectors/simulator";
import { createVesselSimulator } from "./vessels/connectors/simulator";

function collect() {
  const batches: TrackedObject[][] = [];
  const ctx = {
    upsert: (items: TrackedObject[]) => batches.push(items),
    log: { info: () => {} },
  } as unknown as ConnectorContext;
  return { batches, ctx };
}

describe.each([
  ["aircraft", () => createAircraftSimulator({ count: 500, tickMs: 1_000, now: () => Date.now() })],
  ["vessels", () => createVesselSimulator({ count: 500, tickMs: 1_000, now: () => Date.now() })],
] as const)("симулятор %s", (layer, create) => {
  it("выдаёт объекты по контракту и двигает их", () => {
    vi.useFakeTimers();
    const { batches, ctx } = collect();
    const sim = create();
    sim.start(ctx);
    vi.advanceTimersByTime(60_000);
    sim.stop();
    vi.useRealTimers();

    const first = batches[0]!;
    const last = batches[batches.length - 1]!;
    expect(first).toHaveLength(500);
    expect(batches.length).toBeGreaterThan(30);
    for (const item of last) {
      expect(TrackedObjectSchema.safeParse(item).success, JSON.stringify(item)).toBe(true);
      expect(item.layer).toBe(layer);
    }
    expect(new Set(last.map((o) => o.id)).size).toBe(500);

    // За минуту объекты сдвинулись, но правдоподобно (не телепортировались)
    const before = new Map(first.map((o) => [o.id, o.position]));
    const moved = last.map((o) => distanceM(before.get(o.id)!, o.position));
    expect(moved.filter((d) => d > 10).length).toBeGreaterThan(400);
    const maxSpeed = layer === "aircraft" ? 270 : 15;
    // Самолёт мог сесть и взлететь новым рейсом из того же аэропорта, поэтому смотрим медиану
    moved.sort((a, b) => a - b);
    expect(moved[250]!).toBeLessThan(maxSpeed * 61);
  });
});

it("симулятор авиации даёт один борт с сигналом 7700", () => {
  const { batches, ctx } = collect();
  const sim = createAircraftSimulator({ count: 100 });
  sim.start(ctx);
  sim.stop();
  expect(batches[0]!.filter((o) => o.props.squawk === "7700")).toHaveLength(1);
});
