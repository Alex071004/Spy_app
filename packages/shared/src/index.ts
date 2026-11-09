// Общая модель данных для web и api.
// Подробности: docs/04-architecture.md, разделы «Модель данных» и «Протокол WebSocket».

export type LayerId = "aircraft" | "vessels" | "satellites" | "events" | "webcams";

export interface GeoPoint {
  lon: number;
  lat: number;
  /** Высота в метрах над уровнем моря */
  alt?: number;
}

/** [west, south, east, north] в градусах */
export type BBox = [number, number, number, number];

export interface TrackedObject {
  /** Глобально уникальный id вида "<layer>:<sourceId>", например "aircraft:4ca7b5" */
  id: string;
  layer: LayerId;
  position: GeoPoint;
  /** Курс в градусах, 0 = север */
  heading?: number;
  /** Скорость в м/с */
  speed?: number;
  /** Unix time, мс */
  updatedAt: number;
  /** id коннектора-источника */
  source: string;
  /** Специфичные для слоя поля: callsign, type, mmsi, ... */
  props: Record<string, unknown>;
}

// Протокол WebSocket. В фазе 1 станет Zod-схемами в ./protocol.

export type ClientMessage =
  { t: "sub"; layers: LayerId[]; bbox: BBox; z: number } | { t: "view"; bbox: BBox; z: number };

export type ServerMessage =
  | { t: "hello"; server: string; time: number }
  | { t: "snap"; layer: LayerId; items: TrackedObject[] }
  | { t: "delta"; layer: LayerId; up: TrackedObject[]; rm: string[] };
