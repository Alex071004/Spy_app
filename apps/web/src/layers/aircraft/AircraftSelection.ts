import {
  Cartesian2,
  EllipsoidalOccluder,
  SceneTransforms,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Viewer,
} from "cesium";
import type { TrackedObject } from "@spyapp/shared";
import type { LayerRenderer } from "./LayerRenderer";

/** Один выбранный объект; DOM-прицел следует за Cesium без покадровых React-обновлений. */
export class AircraftSelection {
  private id: string | null = null;
  private lastObject: TrackedObject | null = null;
  private readonly handler: ScreenSpaceEventHandler;
  private readonly removeRender: () => void;
  private readonly occluder: EllipsoidalOccluder;
  private readonly scratch = new Cartesian2();

  constructor(
    private readonly viewer: Viewer,
    private readonly renderer: LayerRenderer,
    private readonly reticle: HTMLDivElement,
    private readonly onChange: (object: TrackedObject | null) => void,
  ) {
    this.occluder = new EllipsoidalOccluder(viewer.scene.globe.ellipsoid, viewer.camera.positionWC);
    this.handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    this.handler.setInputAction((event: ScreenSpaceEventHandler.PositionedEvent) => {
      const picked: unknown = viewer.scene.pick(event.position);
      this.select(
        typeof picked === "object" &&
          picked !== null &&
          "id" in picked &&
          typeof picked.id === "string"
          ? picked.id
          : null,
      );
    }, ScreenSpaceEventType.LEFT_CLICK);
    this.removeRender = viewer.scene.postRender.addEventListener(() => this.positionReticle());
  }

  select(id: string | null) {
    this.id = id && this.renderer.getObject(id) ? id : null;
    this.refresh();
    if (!this.id) this.reticle.hidden = true;
    this.viewer.scene.requestRender();
  }

  refresh() {
    const object = this.id ? (this.renderer.getObject(this.id) ?? null) : null;
    if (!object) {
      this.id = null;
      this.reticle.hidden = true;
    }
    if (object !== this.lastObject) {
      this.lastObject = object;
      this.onChange(object);
    }
  }

  /** Доступный с клавиатуры вход: ближайший к центру видимый борт. */
  selectNearest() {
    const { canvas } = this.viewer.scene;
    let nearest: string | null = null;
    let best = Infinity;
    for (const id of this.renderer.ids()) {
      const point = this.screenPosition(id);
      if (!point) continue;
      const distance =
        (point.x - canvas.clientWidth / 2) ** 2 + (point.y - canvas.clientHeight / 2) ** 2;
      if (distance < best) {
        best = distance;
        nearest = id;
      }
    }
    this.select(nearest);
    return nearest !== null;
  }

  private screenPosition(id: string) {
    const position = this.renderer.renderedPosition(id);
    if (!position) return null;
    this.occluder.cameraPosition = this.viewer.camera.positionWC;
    if (!this.occluder.isPointVisible(position)) return null;
    const point = SceneTransforms.worldToWindowCoordinates(
      this.viewer.scene,
      position,
      this.scratch,
    );
    const { canvas } = this.viewer.scene;
    return point &&
      point.x >= 0 &&
      point.y >= 0 &&
      point.x <= canvas.clientWidth &&
      point.y <= canvas.clientHeight
      ? point
      : null;
  }

  private positionReticle() {
    const point = this.id ? this.screenPosition(this.id) : null;
    this.reticle.hidden = !point;
    if (point)
      this.reticle.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, -50%)`;
  }

  destroy() {
    this.select(null);
    this.handler.destroy();
    this.removeRender();
  }
}
