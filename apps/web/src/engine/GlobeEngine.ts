import {
  Cartesian3,
  Cartographic,
  Color,
  Credit,
  ImageryLayer,
  Ion,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  SingleTileImageryProvider,
  Terrain,
  Viewer,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

export interface CursorPosition {
  lon: number;
  lat: number;
}

interface GlobeEngineOptions {
  creditContainer: HTMLElement;
  /** Без токена используются локальные снимки NASA без рельефа. */
  ionToken?: string | undefined;
  onCursor: (pos: CursorPosition | null) => void;
  onCameraHeight: (meters: number) => void;
  onReady: () => void;
  onError: () => void;
}

/**
 * Императивное ядро глобуса: владеет Cesium.Viewer, камерой и пикингом.
 * React с ним не рендерится, а только получает события через колбэки (см. docs/04-architecture.md).
 */
export class GlobeEngine {
  readonly viewer: Viewer;
  private readonly handler: ScreenSpaceEventHandler;
  private readonly removePostRender: () => void;
  private readonly removeRenderError: () => void;
  private readonly removeImageryError: () => void;
  private readonly clearCursor: () => void;
  private nightLayer?: ImageryLayer;
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private cursorFrame = 0;
  private lastHeight = 0;

  constructor(container: HTMLElement, opts: GlobeEngineOptions) {
    const hasIon = Boolean(opts.ionToken);
    if (hasIon) Ion.defaultAccessToken = opts.ionToken!;

    const baseLayer = hasIon
      ? ImageryLayer.fromWorldImagery({})
      : ImageryLayer.fromProviderAsync(
          SingleTileImageryProvider.fromUrl("/earth/blue-marble.jpg", {
            credit: new Credit("NASA / Blue Marble", true),
          }),
        );
    const tokens = getComputedStyle(container);
    const numberToken = (name: string) => Number(tokens.getPropertyValue(name));
    baseLayer.brightness = numberToken("--globe-brightness");
    baseLayer.saturation = numberToken("--globe-saturation");
    baseLayer.contrast = numberToken("--globe-contrast");

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
      requestRenderMode: true,
      maximumRenderTimeChange: 60,
      shouldAnimate: true,
    });

    const { scene } = this.viewer;
    this.viewer.resolutionScale = Math.min(1, 1.5 / window.devicePixelRatio);
    scene.backgroundColor = Color.fromCssColorString(tokens.getPropertyValue("--void").trim());
    scene.globe.baseColor = Color.fromCssColorString(
      tokens.getPropertyValue("--globe-base").trim(),
    );
    scene.globe.showGroundAtmosphere = true;
    scene.globe.enableLighting = true;
    scene.globe.dynamicAtmosphereLighting = true;
    scene.globe.dynamicAtmosphereLightingFromSun = true;
    scene.globe.lightingFadeOutDistance = 50_000_000;
    scene.globe.lightingFadeInDistance = 20_000_000;
    scene.globe.vertexShadowDarkness = 0.3;
    scene.globe.atmosphereBrightnessShift = -0.1;
    if (scene.skyBox) scene.skyBox.show = false;
    scene.postProcessStages.fxaa.enabled = true;
    if (scene.sun) scene.sun.show = false;
    if (scene.moon) scene.moon.show = false;
    scene.screenSpaceCameraController.minimumZoomDistance = 300;
    scene.screenSpaceCameraController.maximumZoomDistance = 45_000_000;

    // Локальный статический композит NASA, не поток актуальных наблюдений.
    const nightLayer = ImageryLayer.fromProviderAsync(
      SingleTileImageryProvider.fromUrl("/earth/earth-lights.png", {
        credit: new Credit("NASA / Earth at Night", true),
      }),
      { dayAlpha: 0, nightAlpha: 0.9, brightness: numberToken("--globe-night-brightness") },
    );
    this.viewer.imageryLayers.add(nightLayer);
    this.nightLayer = nightLayer;

    // Первый кадр сразу показывает Землю, без перелёта с дефолтной камеры Cesium.
    this.viewer.camera.setView({ destination: this.initialDestination() });

    this.handler = new ScreenSpaceEventHandler(scene.canvas);
    this.clearCursor = () => {
      cancelAnimationFrame(this.cursorFrame);
      opts.onCursor(null);
    };
    scene.canvas.addEventListener("mouseleave", this.clearCursor);
    this.handler.setInputAction(
      (movement: ScreenSpaceEventHandler.MotionEvent) =>
        this.queueCursor(movement.endPosition, opts),
      ScreenSpaceEventType.MOUSE_MOVE,
    );

    let ready = false;
    this.removePostRender = scene.postRender.addEventListener(() => {
      if (!ready && baseLayer.ready) {
        ready = true;
        opts.onReady();
      }
      const height = this.viewer.camera.positionCartographic.height;
      if (Math.abs(height - this.lastHeight) > this.lastHeight * 0.002) {
        this.lastHeight = height;
        opts.onCameraHeight(height);
      }
    });
    this.removeRenderError = scene.renderError.addEventListener(() => opts.onError());
    this.removeImageryError = baseLayer.errorEvent.addEventListener(() => opts.onError());
  }

  zoomIn() {
    this.viewer.camera.cancelFlight();
    const height = this.viewer.camera.positionCartographic.height;
    this.viewer.camera.zoomIn(Math.max(0, Math.min(height * 0.35, height - 300)));
    this.viewer.scene.requestRender();
  }
  zoomOut() {
    this.viewer.camera.cancelFlight();
    const height = this.viewer.camera.positionCartographic.height;
    this.viewer.camera.zoomOut(Math.max(0, Math.min(height * 0.5, 45_000_000 - height)));
    this.viewer.scene.requestRender();
  }
  reset() {
    this.viewer.camera.flyTo({
      destination: this.initialDestination(),
      duration: this.reducedMotion ? 0 : 1.2,
    });
  }
  private initialDestination() {
    // Обзор вдоль текущей границы света: и рельеф, и ночные огни видны при любом UTC.
    const now = new Date();
    const hours = now.getUTCHours() + now.getUTCMinutes() / 60;
    const longitude = 180 - hours * 15 - 65;
    return Cartesian3.fromDegrees(longitude, 28, 19_000_000);
  }
  setLighting(enabled: boolean) {
    this.viewer.scene.globe.enableLighting = enabled;
    if (this.nightLayer) this.nightLayer.show = enabled;
    this.viewer.scene.requestRender();
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
    this.removeRenderError();
    this.removeImageryError();
    this.viewer.scene.canvas.removeEventListener("mouseleave", this.clearCursor);
    this.handler.destroy();
    this.viewer.destroy();
  }
}
