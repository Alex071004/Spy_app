import { z } from "zod";

/**
 * Спутники приходят не потоком, а наборами TLE: клиент сам считает позиции и орбиты
 * (satellite.js, SGP4). Описание: docs/api/README.md
 */

/** Группы, которые отдаёт GET /api/satellites/tle?group=... */
export const SATELLITE_GROUPS = [
  "stations",
  "visual",
  "gps",
  "glonass",
  "galileo",
  "weather",
  "starlink",
  "active",
] as const;
export const SatelliteGroupSchema = z.enum(SATELLITE_GROUPS);
export type SatelliteGroup = z.infer<typeof SatelliteGroupSchema>;

export const SatelliteTleSchema = z.object({
  /** Номер NORAD (каталог SATCAT): 25544 для МКС */
  noradId: z.number().int().positive(),
  name: z.string(),
  /** Строки TLE ровно в том виде, в каком их ждёт satellite.js twoline2satrec */
  line1: z.string().length(69),
  line2: z.string().length(69),
});
export type SatelliteTle = z.infer<typeof SatelliteTleSchema>;

/** GET /api/satellites/tle?group=stations */
export const SatellitesResponseSchema = z.object({
  group: SatelliteGroupSchema,
  /** Когда сервер получил набор от источника, unix ms. TLE стареют: точность падает через несколько дней */
  fetchedAt: z.number().int(),
  /** "celestrak" или "fixture" (SIMULATE=1, данные устаревшие) */
  source: z.string(),
  satellites: z.array(SatelliteTleSchema),
});
export type SatellitesResponse = z.infer<typeof SatellitesResponseSchema>;

/** NORAD-номер МКС: удобно для отдельной подсветки */
export const ISS_NORAD_ID = 25544;
