import { expect, it } from "vitest";
import { distanceM, type TrackedObject } from "@spyapp/shared";
import { LiveClient } from "./LiveClient";
import { MotionTrack } from "../layers/aircraft/motion";

// Запускается отдельно против настоящего apps/api, без импорта его реализации в web.
const url = process.env.SPYAPP_B1_WS_URL;
it.runIf(Boolean(url))(
  "B1: snapshot, движение между keyframe и следующая дельта через 5 с",
  async () => {
    let client: LiveClient | undefined;
    let timer: ReturnType<typeof setTimeout>;
    try {
      await new Promise<void>((resolve, reject) => {
        let first: TrackedObject | undefined;
        timer = setTimeout(() => reject(new Error("B1 не прислал ожидаемый keyframe")), 18_000);
        client = new LiveClient(
          {
            url: url!,
            onIssue: (issue) => {
              if (issue) reject(new Error(`B1: ${issue}`));
            },
            onState: (state) => {
              if (state === "incompatible") reject(new Error(state));
            },
            onMessage: (message) => {
              try {
                const items = message.t === "snap" ? message.items : message.up;
                if (!first) {
                  first = items.find(
                    (item) =>
                      item.source === "simulator" &&
                      (item.speed ?? 0) > 150 &&
                      (item.position.alt ?? 0) > 9000 &&
                      Math.abs(item.position.lat) < 65,
                  );
                  if (!first) return;
                  const track = new MotionTrack(first, 0, client!.serverNow());
                  const before = { ...track.sample(3200) };
                  expect(track.isMoving(4200)).toBe(true);
                  expect(distanceM(before, track.sample(4200))).toBeGreaterThan(100);
                }
                const next = items.find(
                  (item) => item.id === first!.id && item.updatedAt >= first!.updatedAt + 5000,
                );
                if (next) {
                  expect(message.t).toBe("delta");
                  expect(distanceM(first.position, next.position)).toBeGreaterThan(100);
                  resolve();
                }
              } catch (error) {
                reject(error);
              }
            },
          },
          { layers: ["aircraft"], bbox: [-30, 20, 60, 70], z: 4 },
        );
        client.start();
      });
    } finally {
      clearTimeout(timer!);
      client?.stop();
    }
  },
  20_000,
);
