import {
  BillboardCollection,
  Cartesian3,
  Math as CesiumMath,
  NearFarScalar,
  type Billboard,
  type Scene,
} from "cesium";
import type { TrackedObject } from "@spyapp/shared";
import { MotionTrack } from "./motion";

interface AircraftPrimitive {
  motion: MotionTrack;
  billboard: Billboard;
}

/** Весь часто меняющийся мир остаётся здесь, React получает только статус соединения. */
export class LayerRenderer {
  private readonly collection: BillboardCollection;
  private readonly tracks = new Map<string, AircraftPrimitive>();
  private readonly removeUpdate: () => void;
  private readonly scratch = new Cartesian3();
  private lastFrame = 0;
  private animating = false;
  private readonly image: string;
  private readonly markerSize: number;

  constructor(
    private readonly scene: Scene,
    tokens: CSSStyleDeclaration,
  ) {
    this.markerSize = Number(tokens.getPropertyValue("--aircraft-marker-size"));
    const fill = tokens.getPropertyValue("--layer-aircraft").trim();
    const outline = tokens.getPropertyValue("--void").trim();
    this.image = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M16 3 19 13 28 19 28 22 19 19 19 26 22 29 10 29 13 26 13 19 4 22 4 19 13 13Z" fill="${fill}" stroke="${outline}" stroke-width="1.6" stroke-linejoin="round"/></svg>`)}`;
    this.collection = scene.primitives.add(new BillboardCollection({ scene }));
    this.removeUpdate = scene.preUpdate.addEventListener(() => this.update(performance.now()));
  }

  get size() {
    return this.tracks.size;
  }

  get hasSimulated() {
    for (const { motion } of this.tracks.values()) {
      if (motion.item.source === "fixture" || motion.item.source === "simulator") return true;
    }
    return false;
  }

  firstPosition() {
    return this.tracks.values().next().value?.motion.sample(performance.now()) ?? null;
  }

  snapshot(items: TrackedObject[], now = performance.now()) {
    const retained = new Set(items.map((item) => item.id));
    for (const [id, track] of this.tracks) {
      if (!retained.has(id)) {
        this.collection.remove(track.billboard);
        this.tracks.delete(id);
      }
    }
    this.upsert(items, now);
  }

  delta(up: TrackedObject[], rm: string[], now = performance.now()) {
    for (const id of rm) {
      const track = this.tracks.get(id);
      if (track) {
        this.collection.remove(track.billboard);
        this.tracks.delete(id);
      }
    }
    this.upsert(up, now);
  }

  private upsert(items: TrackedObject[], now: number) {
    for (const item of items) {
      if (item.layer !== "aircraft") continue;
      const existing = this.tracks.get(item.id);
      if (existing) {
        existing.motion.update(item, now);
        continue;
      }
      const billboard = this.collection.add({
        id: item.id,
        image: this.image,
        position: Cartesian3.fromDegrees(
          item.position.lon,
          item.position.lat,
          item.position.alt ?? 0,
        ),
        width: this.markerSize,
        height: this.markerSize,
        alignedAxis: Cartesian3.UNIT_Z,
        rotation: -CesiumMath.toRadians(item.heading ?? 0),
        scaleByDistance: new NearFarScalar(1_000_000, 1.15, 25_000_000, 0.8),
      });
      this.tracks.set(item.id, { motion: new MotionTrack(item, now), billboard });
    }
    this.lastFrame = 0;
    this.animating = true;
    this.scene.requestRender();
  }

  private update(now: number) {
    if (!this.animating || now - this.lastFrame < 1000 / 30) return;
    this.lastFrame = now;
    let moving = false;
    for (const { motion, billboard } of this.tracks.values()) {
      const position = motion.sample(now);
      billboard.position = Cartesian3.fromDegrees(
        position.lon,
        position.lat,
        position.alt ?? 0,
        undefined,
        this.scratch,
      );
      billboard.rotation = -CesiumMath.toRadians(motion.heading);
      moving ||= motion.isMoving(now);
    }
    this.animating = moving;
    this.scene.requestRender();
  }

  clear() {
    this.tracks.clear();
    this.animating = false;
    this.collection.removeAll();
    this.scene.requestRender();
  }

  destroy() {
    this.removeUpdate();
    this.tracks.clear();
    this.scene.primitives.remove(this.collection);
  }
}
