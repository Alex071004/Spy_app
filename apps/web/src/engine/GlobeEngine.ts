import {
  Cartesian3,
  Cartographic,
  Color,
  ImageryLayer,
  Ion,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Terrain,
  TileMapServiceImageryProvider,
  Viewer,
  buildModuleUrl,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

export interface CursorPosition {
  lon: number;
  lat: number;
}

interface GlobeEngineOptions {
  creditContainer: HTMLElement;
  /** Токен Cesium ion. Без него работает встроенная подложка Natural Earth II без рельефа */
  ionToken?: string | undefined;
  onCursor: (pos: CursorPosition | null) => void;
  onCameraHeight: (meters: number) => void;
}

/**
 * Императивное ядро глобуса: владеет Cesium.Viewer, камерой и пикингом.
 * React с ним не рендерится, а только получает события через колбэки (см. docs/04-architecture.md).
 */
export class GlobeEngine {
  readonly viewer: Viewer;
  private readonly handler: ScreenSpaceEventHandler;
  private readonly removePostRender: () => void;
  private cursorFrame = 0;
  private lastHeight = 0;

  constructor(container: HTMLElement, opts: GlobeEngineOptions) {
    const hasIon = Boolean(opts.ionToken);
    if (hasIon) Ion.defaultAccessToken = opts.ionToken!;

    const baseLayer = hasIon
      ? ImageryLayer.fromWorldImagery({})
      : ImageryLayer.fromProviderAsync(
          TileMapServiceImageryProvider.fromUrl(buildModuleUrl("Assets/Textures/NaturalEarthII")),
          {},
        );
    // Затемняем снимки, чтобы цветные объекты читались поверх (docs/07-design.md)
    baseLayer.brightness = 0.6;
    baseLayer.saturation = 0.7;
    baseLayer.contrast = 1.1;

    this.viewer = new Viewer(container, {
      baseLayer,
      ...(hasIon ? { terrain: Terrain.fromWorldTerrain() } : {}),
      creditContainer: opts.creditContainer,
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      useBrowserRecommendedResolution: false,
    });

    const { scene } = this.viewer;
    scene.backgroundColor = Color.fromCssColorString("#06090d");
    scene.globe.baseColor = Color.fromCssColorString("#0b1219");
    scene.globe.showGroundAtmosphere = true;

    this.viewer.camera.setView({ destination: Cartesian3.fromDegrees(30, 30, 22_000_000) });

    this.handler = new ScreenSpaceEventHandler(scene.canvas);
    this.handler.setInputAction(
      (movement: ScreenSpaceEventHandler.MotionEvent) =>
        this.queueCursor(movement.endPosition, opts),
      ScreenSpaceEventType.MOUSE_MOVE,
    );

    this.removePostRender = scene.postRender.addEventListener(() => {
      const height = this.viewer.camera.positionCartographic.height;
      if (Math.abs(height - this.lastHeight) > this.lastHeight * 0.002) {
        this.lastHeight = height;
        opts.onCameraHeight(height);
      }
    });
  }

  /** Пикинг под курсором не чаще раза за кадр */
  private queueCursor(
    screen: ScreenSpaceEventHandler.MotionEvent["endPosition"],
    opts: GlobeEngineOptions,
  ) {
    cancelAnimationFrame(this.cursorFrame);
    this.cursorFrame = requestAnimationFrame(() => {
      const { scene, camera } = this.viewer;
      const ray = camera.getPickRay(screen);
      const point = ray ? scene.globe.pick(ray, scene) : undefined;
      if (!point) return opts.onCursor(null);
      const carto = Cartographic.fromCartesian(point);
      opts.onCursor({
        lon: CesiumMath.toDegrees(carto.longitude),
        lat: CesiumMath.toDegrees(carto.latitude),
      });
    });
  }

  destroy() {
    cancelAnimationFrame(this.cursorFrame);
    this.removePostRender();
    this.handler.destroy();
    this.viewer.destroy();
  }
}
