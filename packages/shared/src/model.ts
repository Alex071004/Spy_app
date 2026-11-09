import { z } from "zod";

// Общая модель данных. Описание: docs/api/README.md

export const LAYER_IDS = ["aircraft", "vessels", "satellites", "events", "webcams"] as const;
export const LayerIdSchema = z.enum(LAYER_IDS);
export type LayerId = z.infer<typeof LayerIdSchema>;

const lon = z.number().min(-180).max(180);
const lat = z.number().min(-90).max(90);

export const GeoPointSchema = z.object({
  lon,
  lat,
  /** Высота в метрах над уровнем моря */
  alt: z.number().optional(),
});
export type GeoPoint = z.infer<typeof GeoPointSchema>;

/** [west, south, east, north] в градусах. west > east значит, что рамка пересекает антимеридиан */
export const BBoxSchema = z.tuple([lon, lat, lon, lat]);
export type BBox = z.infer<typeof BBoxSchema>;

export const TrackedObjectSchema = z.object({
  /** Глобально уникальный id вида "<layer>:<sourceId>", например "aircraft:4ca7b5" */
  id: z.string().min(1),
  layer: LayerIdSchema,
  position: GeoPointSchema,
  /** Курс в градусах, 0 = север, по часовой стрелке */
  heading: z.number().min(0).lt(360).optional(),
  /** Скорость относительно земли, м/с */
  speed: z.number().nonnegative().optional(),
  /** Время последнего обновления от источника, unix ms */
  updatedAt: z.number().int(),
  /** id коннектора-источника */
  source: z.string(),
  /** Поля конкретного слоя: callsign, type, mmsi... Схемы слоёв появятся в ./layers */
  props: z.record(z.string(), z.unknown()),
});
export type TrackedObject = z.infer<typeof TrackedObjectSchema>;
