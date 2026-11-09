import { describe, expect, it } from "vitest";
import { Math as CesiumMath, Rectangle, type Camera } from "cesium";
import { ClientMessageSchema } from "@spyapp/shared";
import { readViewport } from "./viewport";

function camera(rectangle: Rectangle | undefined, height = 19_000_000) {
  return {
    computeViewRectangle: () => rectangle,
    positionCartographic: { height },
  } as unknown as Camera;
}

describe("подписка по камере", () => {
  it("сохраняет пересечение антимеридиана в координатах контракта", () => {
    const view = readViewport(camera(Rectangle.fromDegrees(170, -20, -170, 30)));
    expect(view.bbox[0]).toBeCloseTo(170);
    expect(view.bbox[2]).toBeCloseTo(-170);
    expect(ClientMessageSchema.safeParse({ t: "view", ...view }).success).toBe(true);
  });
  it("сохраняет полный диапазон долгот и ограничивает zoom", () => {
    expect(
      readViewport(
        camera(
          new Rectangle(-Math.PI, -CesiumMath.PI_OVER_TWO, Math.PI, CesiumMath.PI_OVER_TWO),
          1,
        ),
      ).bbox,
    ).toEqual([-180, -90, 180, 90]);
    expect(readViewport(camera(Rectangle.fromDegrees(-1, -1, 1, 1), 1)).z).toBe(22);
    expect(readViewport(camera(undefined, 1)).z).toBe(0);
    expect(readViewport(camera(undefined, 100_000_000)).z).toBe(0);
    expect(readViewport(camera(undefined)).bbox).toEqual([-180, -90, 180, 90]);
  });
});
