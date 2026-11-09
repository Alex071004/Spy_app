import { fixtureAircraft } from "@spyapp/shared/fixtures";
import type { TrackedObject } from "@spyapp/shared";
import { projectPosition } from "./motion";

/** Три общие вымышленные фикстуры, явно обозначенные в HUD как демонстрация. */
export class FixtureFeed {
  private timer: ReturnType<typeof setInterval> | undefined;
  start(onSnapshot: (items: TrackedObject[]) => void) {
    this.stop();
    const startedAt = performance.now();
    const publish = () => {
      const elapsed = (performance.now() - startedAt) / 1000;
      const now = Date.now();
      onSnapshot(
        fixtureAircraft.map((item) => ({
          ...item,
          position: projectPosition(item.position, item.heading ?? 0, item.speed ?? 0, elapsed),
          updatedAt: now,
        })),
      );
    };
    publish();
    this.timer = setInterval(publish, 1000);
  }
  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
