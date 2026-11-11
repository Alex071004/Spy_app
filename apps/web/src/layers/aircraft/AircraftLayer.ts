import { Cartesian3, HeadingPitchRange, Matrix4, Transforms, type Viewer } from "cesium";
import { LiveClient, type LayerMessage } from "../../engine/LiveClient";
import { readViewport } from "../../engine/viewport";
import { FixtureFeed } from "./FixtureFeed";
import { LayerRenderer } from "./LayerRenderer";

import { initialFeedState, type AircraftFeedState } from "./state";
import { AircraftSelection } from "./AircraftSelection";
import type { TrackedObject } from "@spyapp/shared";
import { resolveAircraft, searchAircraft } from "./search";

export class AircraftLayer {
  private readonly renderer: LayerRenderer;
  private readonly client: LiveClient;
  private readonly fixtures = new FixtureFeed();
  private readonly removeCamera: () => void;
  private state = { ...initialFeedState };
  private active: boolean;
  private readonly selection: AircraftSelection;
  private readonly removeTracking: () => void;
  private trackedId: string | null = null;
  private lastSubscription = 0;
  private readonly trackingOffset = new Cartesian3();
  private readonly trackingTransform = new Matrix4();
  private readonly reportTracking: (id: string | null) => void;

  constructor(
    private readonly viewer: Viewer,
    options: {
      url: string;
      tokens: CSSStyleDeclaration;
      active: boolean;
      onState: (state: AircraftFeedState) => void;
      reticle: HTMLDivElement;
      onSelection: (object: TrackedObject | null) => void;
      onTracking: (id: string | null) => void;
    },
  ) {
    this.active = options.active;
    this.reportTracking = options.onTracking;
    this.renderer = new LayerRenderer(viewer.scene, options.tokens);
    this.selection = new AircraftSelection(viewer, this.renderer, options.reticle, (object) => {
      if (object?.id !== this.trackedId) this.stopTracking();
      options.onSelection(object);
    });
    const report = (patch: Partial<AircraftFeedState>) => {
      if (
        Object.entries(patch).every(
          ([key, value]) => this.state[key as keyof AircraftFeedState] === value,
        )
      )
        return;
      this.state = { ...this.state, ...patch };
      options.onState(this.state);
    };
    this.client = new LiveClient(
      {
        url: options.url,
        onMessage: (message) => this.receive(message, report),
        onState: (connection) => {
          if (this.state.mode === "stream") this.renderer.setPredicting(connection === "live");
          if (connection === "incompatible") {
            this.fixtures.stop();
            this.renderer.clear();
            this.selection.select(null);
          }
          report({ connection });
        },
        onIssue: (issue) => report({ issue }),
      },
      { layers: this.active ? ["aircraft"] : [], ...readViewport(viewer.camera) },
    );
    this.removeCamera = viewer.camera.moveEnd.addEventListener(() =>
      this.client.setSubscription(this.active ? ["aircraft"] : [], readViewport(viewer.camera)),
    );
    this.getView = () => readViewport(viewer.camera);
    // Примитивы обновлены до этого обработчика; React не участвует в сопровождении.
    this.removeTracking = viewer.scene.preUpdate.addEventListener(() => {
      if (!this.trackedId) return;
      const position = this.renderer.renderedPosition(this.trackedId);
      if (!position) {
        this.clearSelection();
        return;
      }
      Cartesian3.clone(viewer.camera.position, this.trackingOffset);
      viewer.camera.lookAtTransform(
        Transforms.eastNorthUpToFixedFrame(position, undefined, this.trackingTransform),
        this.trackingOffset,
      );
      const now = performance.now();
      if (now - this.lastSubscription >= 5000) {
        this.lastSubscription = now;
        this.client.setSubscription(["aircraft"], this.getView());
      }
    });
    if (this.active) this.startDemo();
    this.client.start();
  }

  private readonly getView: () => ReturnType<typeof readViewport>;

  private startDemo() {
    this.fixtures.start((items) => {
      this.renderer.snapshot(items);
      this.selection.refresh();
    });
  }

  private receive(message: LayerMessage, report: (patch: Partial<AircraftFeedState>) => void) {
    if (!this.active || message.layer !== "aircraft") return;
    if (this.state.mode !== "stream") {
      this.fixtures.stop();
      this.renderer.clear();
    }
    const now = performance.now();
    const sourceNow = this.client.serverNow();
    if (message.t === "snap") this.renderer.snapshot(message.items, now, sourceNow);
    else this.renderer.delta(message.up, message.rm, now, sourceNow);
    report({ mode: "stream", simulated: this.renderer.hasSimulated });
    this.selection.refresh();
  }

  setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    this.renderer.clear();
    this.selection.select(null);
    this.fixtures.stop();
    if (active && this.state.mode === "demo" && this.state.connection !== "incompatible")
      this.startDemo();
    this.client.setSubscription(active ? ["aircraft"] : [], this.getView());
  }

  focus() {
    this.stopTracking();
    const position = this.renderer.firstPosition();
    if (!position) return;
    this.viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(position.lon, position.lat, 650_000),
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1.2,
    });
  }

  selectNearest() {
    return this.selection.selectNearest();
  }
  clearSelection() {
    this.stopTracking();
    this.selection.select(null);
  }

  search(query: string) {
    return searchAircraft(this.renderer.objects(), query);
  }

  track(query: string) {
    const object = resolveAircraft(this.renderer.objects(), query, true);
    if (!object) return false;
    const position = this.renderer.renderedPosition(object.id);
    if (!position) return false;
    this.stopTracking();
    this.trackedId = object.id;
    this.selection.select(object.id);
    this.viewer.camera.cancelFlight();
    this.viewer.camera.lookAt(position, new HeadingPitchRange(0, -Math.PI / 3, 500_000));
    this.lastSubscription = performance.now();
    this.client.setSubscription(["aircraft"], this.getView());
    this.reportTracking(object.id);
    this.viewer.scene.requestRender();
    return true;
  }

  trackObject(object: TrackedObject) {
    if (
      !this.active ||
      object.layer !== "aircraft" ||
      this.state.mode !== "stream" ||
      this.state.connection !== "live"
    )
      return false;
    // REST даёт первый объект вне viewport; далее его обновляет обычная WS-подписка.
    this.renderer.delta([object], [], performance.now(), this.client.serverNow());
    return this.track(object.id);
  }

  stopTracking() {
    if (!this.trackedId) return;
    this.trackedId = null;
    this.viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    this.reportTracking(null);
    this.viewer.scene.requestRender();
  }

  destroy() {
    this.stopTracking();
    this.removeTracking();
    this.client.stop();
    this.fixtures.stop();
    this.removeCamera();
    this.selection.destroy();
    this.renderer.destroy();
  }
}
