import { create } from "zustand";
import type { LayerId, TrackedObject } from "@spyapp/shared";
import type { CursorPosition } from "../engine/GlobeEngine";
import { initialFeedState, type AircraftFeedState } from "../layers/aircraft/state";

interface ViewState {
  cursor: CursorPosition | null;
  cameraHeight: number;
  activeLayers: Record<LayerId, boolean>;
  feed: AircraftFeedState;
  selectedObject: TrackedObject | null;
  trackedId: string | null;
  setTrackedId: (id: string | null) => void;
  setSelectedObject: (object: TrackedObject | null) => void;
  setFeed: (feed: AircraftFeedState) => void;
  setCursor: (cursor: CursorPosition | null) => void;
  setCameraHeight: (meters: number) => void;
  toggleLayer: (id: LayerId) => void;
}

export const useViewStore = create<ViewState>()((set) => ({
  cursor: null,
  cameraHeight: 0,
  feed: initialFeedState,
  selectedObject: null,
  trackedId: null,
  setTrackedId: (trackedId) => set({ trackedId }),
  setSelectedObject: (selectedObject) => set({ selectedObject }),
  setFeed: (feed) => set({ feed }),
  activeLayers: { aircraft: true, vessels: true, satellites: false, events: true, webcams: false },
  setCursor: (cursor) => set({ cursor }),
  setCameraHeight: (cameraHeight) => set({ cameraHeight }),
  toggleLayer: (id) =>
    set((s) => ({ activeLayers: { ...s.activeLayers, [id]: !s.activeLayers[id] } })),
}));
