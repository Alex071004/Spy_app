import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "cesium";
import type { LayerRenderer } from "./LayerRenderer";
import { fixtureAircraft } from "@spyapp/shared/fixtures";
import { AircraftSelection } from "./AircraftSelection";

const mocks = vi.hoisted(() => ({
  click: undefined as ((event: { position: { x: number; y: number } }) => void) | undefined,
  picked: null as unknown,
  destroyed: vi.fn(),
}));
vi.mock("cesium", () => ({
  Cartesian2: class {
    x = 0;
    y = 0;
  },
  EllipsoidalOccluder: class {
    cameraPosition: unknown;
    isPointVisible(point: { visible?: boolean }) {
      return point.visible !== false;
    }
  },
  SceneTransforms: {
    worldToWindowCoordinates: (
      _scene: unknown,
      position: { x: number; y: number },
      result: { x: number; y: number },
    ) => Object.assign(result, { x: position.x, y: position.y }),
  },
  ScreenSpaceEventType: { LEFT_CLICK: 2 },
  ScreenSpaceEventHandler: class {
    setInputAction(callback: typeof mocks.click) {
      mocks.click = callback;
    }
    destroy() {
      mocks.destroyed();
    }
  },
}));

function harness() {
  const first = fixtureAircraft[0]!,
    second = fixtureAircraft[1]!;
  const objects = new Map([
    [first.id, first],
    [second.id, second],
  ]);
  const positions = new Map([
    [first.id, { x: 400, y: 300, visible: true }],
    [second.id, { x: 100, y: 100, visible: true }],
  ]);
  let render = () => {};
  const removed = vi.fn(),
    onChange = vi.fn();
  const viewer = {
    camera: { positionWC: {} },
    scene: {
      globe: { ellipsoid: {} },
      canvas: { clientWidth: 800, clientHeight: 600 },
      pick: () => mocks.picked,
      requestRender: vi.fn(),
      postRender: {
        addEventListener: (callback: () => void) => {
          render = callback;
          return removed;
        },
      },
    },
  } as unknown as Viewer;
  const renderer = {
    getObject: (id: string) => objects.get(id),
    renderedPosition: (id: string) => positions.get(id),
    ids: () => objects.keys(),
  } as unknown as LayerRenderer;
  const reticle = { hidden: true, style: { transform: "" } } as HTMLDivElement;
  const selection = new AircraftSelection(viewer, renderer, reticle, onChange);
  return {
    selection,
    objects,
    positions,
    reticle,
    onChange,
    removed,
    first,
    second,
    render: () => render(),
  };
}

beforeEach(() => {
  mocks.picked = null;
  mocks.destroyed.mockClear();
});
describe("выбор самолёта", () => {
  it("выбирает по клику, двигает только DOM-прицел, обновляет данные при измерении", () => {
    const h = harness();
    mocks.picked = { id: h.first.id };
    mocks.click!({ position: { x: 400, y: 300 } });
    h.render();
    expect(h.onChange).toHaveBeenCalledWith(h.first);
    expect(h.reticle.hidden).toBe(false);
    h.positions.set(h.first.id, { x: 420, y: 310, visible: true });
    h.render();
    expect(h.reticle.style.transform).toContain("420px, 310px");
    expect(h.onChange).toHaveBeenCalledTimes(1);
    const next = { ...h.first, updatedAt: h.first.updatedAt + 5000 };
    h.objects.set(h.first.id, next);
    h.selection.refresh();
    expect(h.onChange).toHaveBeenLastCalledWith(next);
    h.selection.destroy();
  });
  it("снимает выбор удалённого объекта и освобождает обработчики", () => {
    const h = harness();
    h.selection.select(h.first.id);
    h.objects.delete(h.first.id);
    h.selection.refresh();
    expect(h.onChange).toHaveBeenLastCalledWith(null);
    expect(h.reticle.hidden).toBe(true);
    h.selection.destroy();
    expect(h.removed).toHaveBeenCalledOnce();
    expect(mocks.destroyed).toHaveBeenCalledOnce();
  });
  it("не показывает прицел за Землёй или за экраном, выбирает видимый борт", () => {
    const h = harness();
    h.selection.select(h.first.id);
    h.positions.set(h.first.id, { x: 400, y: 300, visible: false });
    h.render();
    expect(h.reticle.hidden).toBe(true);
    expect(h.selection.selectNearest()).toBe(true);
    expect(h.onChange).toHaveBeenLastCalledWith(h.second);
    h.positions.set(h.second.id, { x: -1, y: 100, visible: true });
    h.render();
    expect(h.reticle.hidden).toBe(true);
    expect(h.selection.selectNearest()).toBe(false);
    expect(h.onChange).toHaveBeenLastCalledWith(null);
    h.selection.destroy();
  });
  it("игнорирует чужие примитивы и снимает выбор по пустому клику", () => {
    const h = harness();
    h.selection.select(h.first.id);
    mocks.picked = { id: "not-an-aircraft" };
    mocks.click!({ position: { x: 10, y: 10 } });
    expect(h.onChange).toHaveBeenLastCalledWith(null);
    h.selection.select(h.first.id);
    mocks.picked = null;
    mocks.click!({ position: { x: 0, y: 0 } });
    expect(h.onChange).toHaveBeenLastCalledWith(null);
    h.selection.destroy();
  });
});
