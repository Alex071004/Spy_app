import { useEffect, useRef } from "react";
import { GlobeEngine } from "../engine/GlobeEngine";
import { useViewStore } from "../store/view";
import { TopBar } from "../features/hud/TopBar";
import { LayerPanel } from "../features/hud/LayerPanel";
import { StatusBar } from "../features/hud/StatusBar";

export function App() {
  const globeRef = useRef<HTMLDivElement>(null);
  const creditRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!globeRef.current || !creditRef.current) return;
    const { setCursor, setCameraHeight } = useViewStore.getState();
    const engine = new GlobeEngine(globeRef.current, {
      creditContainer: creditRef.current,
      ionToken: import.meta.env.VITE_CESIUM_ION_TOKEN,
      onCursor: setCursor,
      onCameraHeight: setCameraHeight,
    });
    return () => engine.destroy();
  }, []);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-void">
      <div ref={globeRef} className="absolute inset-0" />

      {/* HUD поверх глобуса: клики проходят сквозь пустые области */}
      <div className="pointer-events-none absolute inset-0 flex flex-col">
        <TopBar />
        <main className="relative flex-1 p-3">
          <LayerPanel />
        </main>
        <StatusBar creditRef={creditRef} />
      </div>
    </div>
  );
}
