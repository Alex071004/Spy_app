import { create } from "zustand";
import type { LayerId } from "@spyapp/shared";
import type { CursorPosition } from "../engine/GlobeEngine";

interface ViewState {
  cursor: CursorPosition | null;
  cameraHeight: number;
  activeLayers: Record<LayerId, boolean>;
  setCursor: (cursor: CursorPosition | null) => void;
  setCameraHeight: (meters: number) => void;
  toggleLayer: (id: LayerId) => void;
}

export const useViewStore = create<ViewState>()((set) => ({
  cursor: null,
  cameraHeight: 0,
  activeLayers: { aircraft: true, vessels: true, satellites: false, events: true, webcams: false },
  setCursor: (cursor) => set({ cursor }),
  setCameraHeight: (cameraHeight) => set({ cameraHeight }),
  toggleLayer: (id) =>
    set((s) => ({ activeLayers: { ...s.activeLayers, [id]: !s.activeLayers[id] } })),
}));
