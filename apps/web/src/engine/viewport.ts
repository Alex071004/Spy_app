import { Math as CesiumMath, type Camera } from "cesium";
import type { Viewport } from "./LiveClient";

/** При взгляде мимо Земли используем глобальный обзор с серверным прореживанием. */
export function readViewport(camera: Camera): Viewport {
  const rectangle = camera.computeViewRectangle();
  const z = Math.max(
    0,
    Math.min(
      22,
      Math.round(Math.log2(40_000_000 / Math.max(1, camera.positionCartographic.height))),
    ),
  );
  if (!rectangle) return { bbox: [-180, -90, 180, 90], z: 0 };
  const fullLongitude = rectangle.width >= CesiumMath.TWO_PI - 0.00001;
  return {
    bbox: [
      fullLongitude ? -180 : CesiumMath.toDegrees(CesiumMath.negativePiToPi(rectangle.west)),
      CesiumMath.toDegrees(rectangle.south),
      fullLongitude ? 180 : CesiumMath.toDegrees(CesiumMath.negativePiToPi(rectangle.east)),
      CesiumMath.toDegrees(rectangle.north),
    ],
    z,
  };
}
