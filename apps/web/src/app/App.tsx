import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Panel } from "@spyapp/ui";
import { GlobeEngine } from "../engine/GlobeEngine";
import { useViewStore } from "../store/view";
import { TopBar } from "../features/hud/TopBar";
import { LayerPanel } from "../features/hud/LayerPanel";
import { StatusBar } from "../features/hud/StatusBar";
import { SceneControls, type CameraAction } from "../features/hud/SceneControls";
import { Icon } from "../features/hud/Icon";

export function App() {
  const { t } = useTranslation();
  const globeRef = useRef<HTMLDivElement>(null);
  const creditRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GlobeEngine | null>(null);
  const [layersOpen, setLayersOpen] = useState(
    () => !window.matchMedia("(max-width: 700px)").matches,
  );
  const [lighting, setLighting] = useState(true);
  const [sceneState, setSceneState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!globeRef.current || !creditRef.current) return;
    const { setCursor, setCameraHeight } = useViewStore.getState();
    let engine: GlobeEngine;
    try {
      engine = new GlobeEngine(globeRef.current, {
        creditContainer: creditRef.current,
        ionToken: import.meta.env.VITE_CESIUM_ION_TOKEN,
        onCursor: setCursor,
        onCameraHeight: setCameraHeight,
        onReady: () => setSceneState("ready"),
        onError: () => setSceneState("error"),
      });
      engineRef.current = engine;
    } catch {
      setSceneState("error");
      return;
    }
    return () => {
      engineRef.current = null;
      engine.destroy();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable)
      )
        return;
      if (event.code === "KeyL") setLayersOpen((open) => !open);
      if (event.key === "Escape") setLayersOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onCamera = (action: CameraAction) => engineRef.current?.[action]();
  const toggleLighting = () => {
    const next = !lighting;
    engineRef.current?.setLighting(next);
    setLighting(next);
  };

  return (
    <div className="app-shell">
      <div className="space-glow" aria-hidden="true" />
      <div ref={globeRef} className="globe-viewport" role="region" aria-label={t("scene.globe")} />
      <div className="hud-shell">
        <TopBar />
        <main className="workspace">
          <div className="view-heading">
            <div className="hud-label">{t("scene.eyebrow")}</div>
            <h1>{t("scene.title")}</h1>
            <p>{t("scene.subtitle")}</p>
          </div>
          <aside className="left-rail">
            {layersOpen && <LayerPanel onClose={() => setLayersOpen(false)} />}
            <div className="briefing-panel">
              <Panel
                title={t("intel.title")}
                aside={<span className="preview-badge">{t("intel.badge")}</span>}
              >
                <div className="intel-empty">
                  <span className="intel-symbol">
                    <Icon name="events" />
                  </span>
                  <h2>{t("intel.heading")}</h2>
                  <p>{t("intel.description")}</p>
                </div>
                <div className="intel-footer">
                  <span className="status-dot" />
                  {t("intel.footer")}
                </div>
              </Panel>
            </div>
          </aside>
          <div className="view-mode">
            <span className="status-dot accent" />
            <span>{t("scene.orbit")}</span>
            <span className="hud-num">3D</span>
          </div>
          {sceneState !== "ready" && (
            <div
              className={`scene-notice hud-panel ${sceneState === "error" ? "scene-error" : ""}`}
              role="status"
            >
              {t(sceneState === "error" ? "scene.error" : "scene.loading")}
            </div>
          )}
          <SceneControls
            onCamera={onCamera}
            lighting={lighting}
            onLighting={toggleLighting}
            layersOpen={layersOpen}
            onLayers={() => setLayersOpen((open) => !open)}
          />
          <div className="scene-caption">
            <span className="hud-label">{t("scene.earth")}</span>
            <span>{t("scene.drag")}</span>
          </div>
          <div className="map-source">
            <span className="source-mark">
              <Icon name="globe" />
            </span>
            <div>
              <span className="hud-label">{t("scene.basemap")}</span>
              <span>
                {import.meta.env.VITE_CESIUM_ION_TOKEN ? t("scene.ion") : t("scene.naturalEarth")}
              </span>
            </div>
          </div>
        </main>
        <StatusBar creditRef={creditRef} />
      </div>
    </div>
  );
}
