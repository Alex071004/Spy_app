import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Panel, Reticle } from "@spyapp/ui";
import { GlobeEngine } from "../engine/GlobeEngine";
import { useViewStore } from "../store/view";
import { TopBar } from "../features/hud/TopBar";
import { LayerPanel } from "../features/hud/LayerPanel";
import { StatusBar } from "../features/hud/StatusBar";
import { SceneControls, type CameraAction } from "../features/hud/SceneControls";
import { Icon } from "../features/hud/Icon";
import { AircraftLayer } from "../layers/aircraft/AircraftLayer";
import { initialFeedState } from "../layers/aircraft/state";
import { FeedNotice } from "../features/hud/FeedNotice";
import { AircraftDossier } from "../features/object-card/AircraftDossier";
import { CommandBar } from "../features/command-bar/CommandBar";
import { parseCommand } from "../features/command-bar/commands";
import {
  ApiRequestError,
  loadAircraft,
  resolveSearchResult,
  searchWorld,
} from "../features/command-bar/api";

export function App() {
  const { t } = useTranslation();
  const globeRef = useRef<HTMLDivElement>(null);
  const creditRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GlobeEngine | null>(null);
  const aircraftRef = useRef<AircraftLayer | null>(null);
  const reticleRef = useRef<HTMLDivElement>(null);
  const hasSelection = useViewStore((state) => state.selectedObject !== null);
  const trackedId = useViewStore((state) => state.trackedId);
  const [commandOpen, setCommandOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [noneVisible, setNoneVisible] = useState(false);
  const [layersOpen, setLayersOpen] = useState(
    () => !window.matchMedia("(max-width: 700px)").matches,
  );
  const [lighting, setLighting] = useState(true);
  const [sceneState, setSceneState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!globeRef.current || !creditRef.current || !reticleRef.current) return;
    const { setCursor, setCameraHeight, setFeed, setSelectedObject, activeLayers } =
      useViewStore.getState();
    setSelectedObject(null);
    useViewStore.getState().setTrackedId(null);
    setFeed(initialFeedState);
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
    const aircraft = new AircraftLayer(engine.viewer, {
      url: import.meta.env.VITE_WS_URL ?? "ws://localhost:4000/ws",
      tokens: getComputedStyle(globeRef.current),
      active: activeLayers.aircraft,
      onState: setFeed,
      onTracking: useViewStore.getState().setTrackedId,
      reticle: reticleRef.current,
      onSelection: (object) => {
        setSelectedObject(object);
        if (object) setNoneVisible(false);
      },
    });
    aircraftRef.current = aircraft;
    const unsubscribe = useViewStore.subscribe((state, previous) => {
      if (state.activeLayers.aircraft !== previous.activeLayers.aircraft)
        aircraft.setActive(state.activeLayers.aircraft);
    });
    return () => {
      unsubscribe();
      aircraftRef.current = null;
      aircraft.destroy();
      engineRef.current = null;
      engine.destroy();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.code === "KeyK") {
        event.preventDefault();
        if (!event.repeat) setCommandOpen((open) => !open);
        return;
      }
      if (commandOpen) return;
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
      if (event.key === "Escape") {
        if (useViewStore.getState().selectedObject) aircraftRef.current?.clearSelection();
        else setLayersOpen(false);
        setNoneVisible(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commandOpen]);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timer);
  }, [feedback]);

  const onCamera = (action: CameraAction) => {
    if (action === "reset") {
      aircraftRef.current?.stopTracking();
      setFeedback(null);
    }
    engineRef.current?.[action]();
  };
  const execute = async (input: string, signal: AbortSignal): Promise<string | null> => {
    const result = parseCommand(input);
    if ("error" in result) return t(`command.errors.${result.error}`);
    const command = result.command;
    if (command.kind === "layer") {
      const { activeLayers, toggleLayer } = useViewStore.getState();
      const next = command.mode === "toggle" ? !activeLayers[command.id] : command.mode === "on";
      if (next !== activeLayers[command.id]) toggleLayer(command.id);
      setFeedback(
        t("command.layerChanged", {
          name: t(`layers.${command.id}`),
          state: t(next ? "command.on" : "command.off"),
        }),
      );
      return null;
    }
    if (!engineRef.current || !aircraftRef.current) return t("command.errors.unavailable");
    if (command.kind === "track") {
      if (!useViewStore.getState().activeLayers.aircraft) return t("command.errors.aircraftOff");
      if (!aircraftRef.current.track(command.query)) {
        const feed = useViewStore.getState().feed;
        if (feed.mode !== "stream" || feed.connection !== "live")
          return t("command.errors.waitingStream");
        try {
          let id = command.query.trim();
          if (!/^aircraft:/i.test(id)) {
            const matches = (await searchWorld(id, signal)).filter(
              (item) => item.kind === "object" && item.layer === "aircraft",
            );
            const result = resolveSearchResult(matches, id);
            if (!result) return t("command.errors.notFound");
            id = result.id;
          }
          const object = await loadAircraft(id, signal);
          if (signal.aborted) return null;
          if (!aircraftRef.current?.trackObject(object)) return t("command.errors.waitingStream");
        } catch (error) {
          return t(
            error instanceof ApiRequestError && error.status === 404
              ? "command.errors.notFound"
              : "command.errors.server",
          );
        }
      }
      setFeedback(null);
    } else if (command.kind === "stop") {
      aircraftRef.current.stopTracking();
      setFeedback(t("command.stopped"));
    } else if (command.kind === "goto") {
      aircraftRef.current.stopTracking();
      engineRef.current.goTo(command.lat, command.lon, command.height);
      setFeedback(t("command.moved"));
    } else {
      try {
        const matches = (await searchWorld(command.query, signal)).filter(
          (item) => item.kind === "place",
        );
        const result = resolveSearchResult(matches, command.query);
        if (!result) return t("command.errors.placeNotFound");
        if (signal.aborted) return null;
        aircraftRef.current?.stopTracking();
        engineRef.current?.goTo(result.position.lat, result.position.lon, 750_000);
        setFeedback(t("command.moved"));
      } catch {
        return t("command.errors.server");
      }
    }
    return null;
  };
  const toggleLighting = () => {
    const next = !lighting;
    engineRef.current?.setLighting(next);
    setLighting(next);
  };

  return (
    <div className={`app-shell ${hasSelection ? "object-selected" : ""}`}>
      <div className="space-glow" aria-hidden="true" />
      <div ref={globeRef} className="globe-viewport" role="region" aria-label={t("scene.globe")}>
        <Reticle ref={reticleRef} />
      </div>
      <div className="hud-shell">
        <TopBar onCommand={() => setCommandOpen(true)} />
        <main className={`workspace ${hasSelection ? "has-selection" : ""}`}>
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
          {(trackedId || feedback) && (
            <div className="command-feedback hud-panel" role="status">
              <Icon name={trackedId ? "target" : "terminal"} />
              <span>{trackedId ? t("command.tracking") : feedback}</span>
              {trackedId && (
                <button type="button" onClick={() => aircraftRef.current?.stopTracking()}>
                  {t("command.stop")}
                </button>
              )}
            </div>
          )}
          {sceneState !== "ready" && (
            <div
              className={`scene-notice hud-panel ${sceneState === "error" ? "scene-error" : ""}`}
              role="status"
            >
              {t(sceneState === "error" ? "scene.error" : "scene.loading")}
            </div>
          )}
          <SceneControls
            onSelect={() => setNoneVisible(!(aircraftRef.current?.selectNearest() ?? false))}
            onCamera={onCamera}
            lighting={lighting}
            onLighting={toggleLighting}
            layersOpen={layersOpen}
            onLayers={() => setLayersOpen((open) => !open)}
          />
          <AircraftDossier
            onClose={() => {
              aircraftRef.current?.clearSelection();
              globeRef.current?.querySelector("canvas")?.focus();
            }}
          />
          {noneVisible && (
            <div className="selection-notice hud-panel" role="status">
              {t("object.noneVisible")}
            </div>
          )}
          <FeedNotice onFocus={() => aircraftRef.current?.focus()} />
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
      <CommandBar
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        search={(query) => aircraftRef.current?.search(query) ?? []}
        execute={execute}
      />
    </div>
  );
}
