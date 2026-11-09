import { Cartesian3, type Viewer } from "cesium";
import { LiveClient, type LayerMessage } from "../../engine/LiveClient";
import { readViewport } from "../../engine/viewport";
import { FixtureFeed } from "./FixtureFeed";
import { LayerRenderer } from "./LayerRenderer";

import { initialFeedState, type AircraftFeedState } from "./state";
import { AircraftSelection } from "./AircraftSelection";
import type { TrackedObject } from "@spyapp/shared";

export class AircraftLayer {
  private readonly renderer: LayerRenderer;
  private readonly client: LiveClient;
  private readonly fixtures = new FixtureFeed();
  private readonly removeCamera: () => void;
  private state = { ...initialFeedState };
  private active: boolean;
  private readonly selection: AircraftSelection;

  constructor(
    private readonly viewer: Viewer,
    options: {
      url: string;
      tokens: CSSStyleDeclaration;
      active: boolean;
      onState: (state: AircraftFeedState) => void;
      reticle: HTMLDivElement;
      onSelection: (object: TrackedObject | null) => void;
    },
  ) {
    this.active = options.active;
    this.renderer = new LayerRenderer(viewer.scene, options.tokens);
    this.selection = new AircraftSelection(
      viewer,
      this.renderer,
      options.reticle,
      options.onSelection,
    );
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
    this.selection.select(null);
  }

  destroy() {
    this.client.stop();
    this.fixtures.stop();
    this.removeCamera();
    this.selection.destroy();
    this.renderer.destroy();
  }
}
