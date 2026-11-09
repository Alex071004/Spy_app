import { create } from "zustand";
import type { LayerId } from "@spyapp/shared";
import type { CursorPosition } from "../engine/GlobeEngine";
import { initialFeedState, type AircraftFeedState } from "../layers/aircraft/state";

interface ViewState {
  cursor: CursorPosition | null;
  cameraHeight: number;
  activeLayers: Record<LayerId, boolean>;
  feed: AircraftFeedState;
  setFeed: (feed: AircraftFeedState) => void;
  setCursor: (cursor: CursorPosition | null) => void;
  setCameraHeight: (meters: number) => void;
  toggleLayer: (id: LayerId) => void;
}

export const useViewStore = create<ViewState>()((set) => ({
  cursor: null,
  cameraHeight: 0,
  feed: initialFeedState,
  setFeed: (feed) => set({ feed }),
  activeLayers: { aircraft: true, vessels: true, satellites: false, events: true, webcams: false },
  setCursor: (cursor) => set({ cursor }),
  setCameraHeight: (cameraHeight) => set({ cameraHeight }),
  toggleLayer: (id) =>
    set((s) => ({ activeLayers: { ...s.activeLayers, [id]: !s.activeLayers[id] } })),
}));
