import { describe, expect, it, vi } from "vitest";
import { BillboardCollection, Cartesian3, type Scene } from "cesium";
import { fixtureAircraft } from "@spyapp/shared/fixtures";
import { LayerRenderer } from "./LayerRenderer";

function harness() {
  let collection: BillboardCollection;
  let update: () => void = () => {};
  const removeUpdate = vi.fn();
  const scene = {
    frameState: { mode: 3 },
    primitives: {
      add: (value: BillboardCollection) => {
        collection = value;
        return value;
      },
      remove: (value: BillboardCollection) => {
        value.destroy();
        return true;
      },
    },
    preUpdate: {
      addEventListener: (callback: () => void) => {
        update = callback;
        return removeUpdate;
      },
    },
    requestRender: vi.fn(),
  } as unknown as Scene;
  const tokens = {
    getPropertyValue: (key: string) => (key === "--aircraft-marker-size" ? "20" : "#ffd166"),
  } as CSSStyleDeclaration;
  const renderer = new LayerRenderer(scene, tokens);
  return { renderer, collection: collection!, tick: () => update(), removeUpdate, scene };
}

describe("LayerRenderer: настоящие коллекции Cesium без WebGL", () => {
  it("замораживает прогноз при потере соединения", () => {
    const clock = vi.spyOn(performance, "now");
    clock.mockReturnValue(1000);
    const h = harness();
    const item = { ...fixtureAircraft[0]!, updatedAt: Date.now() };
    h.renderer.snapshot([item], 1000, item.updatedAt);
    clock.mockReturnValue(5000);
    h.tick();
    h.renderer.setPredicting(false);
    h.tick();
    const frozen = Cartesian3.clone(h.collection.get(0).position);
    clock.mockReturnValue(10000);
    h.tick();
    expect(h.collection.get(0).position).toEqual(frozen);
    h.renderer.destroy();
    clock.mockRestore();
  });
  it("согласует snapshot, delta и удаления без пересоздания прежних billboard", () => {
    const h = harness();
    h.renderer.snapshot(fixtureAircraft, 0);
    expect(h.renderer.size).toBe(3);
    expect(h.collection.length).toBe(3);
    const retained = h.collection.get(0);
    const first = fixtureAircraft[0]!;
    h.renderer.delta(
      [{ ...first, updatedAt: first.updatedAt + 1000 }],
      [fixtureAircraft[1]!.id],
      1000,
    );
    expect(h.renderer.size).toBe(2);
    expect(h.collection.contains(retained)).toBe(true);
    h.renderer.snapshot([first], 2000);
    expect(h.collection.length).toBe(1);
    expect(h.collection.get(0)).toBe(retained);
    h.renderer.snapshot([], 3000);
    expect(h.renderer.size).toBe(0);
    expect(h.collection.length).toBe(0);
    h.renderer.destroy();
    expect(h.removeUpdate).toHaveBeenCalledOnce();
    expect(h.collection.isDestroyed()).toBe(true);
  });

  it("без Entity API обновляет 10k примитивов и освобождает их при выключении", () => {
    const h = harness();
    const items = Array.from({ length: 10_000 }, (_, index) => ({
      ...fixtureAircraft[0]!,
      id: `aircraft:test-${index}`,
    }));
    h.renderer.snapshot(items);
    h.tick();
    expect(h.collection.length).toBe(10_000);
    expect(Cartesian3.magnitude(h.collection.get(0).position)).toBeGreaterThan(6_000_000);
    h.renderer.clear();
    expect(h.renderer.firstPosition()).toBeNull();
    expect(h.collection.length).toBe(0);
    h.renderer.destroy();
  });
});
