import { z } from "zod";
import { BBoxSchema, GeoPointSchema, LayerIdSchema, TrackedObjectSchema } from "./model";

// REST-ответы API. Описание: docs/api/README.md

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  /** Аптайм процесса, секунды */
  uptime: z.number().int(),
  protocol: z.number().int(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/** Тело любого ответа с ошибкой (4xx/5xx) */
export const ApiErrorSchema = z.object({
  /** Машинный код: "not_found", "bad_request" */
  error: z.string(),
  message: z.string(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/**
 * Фото объекта со стороннего сервиса. Условия показа:
 * картинку грузить по этим URL (не копировать к себе), рядом подписывать автора и давать ссылку pageUrl.
 */
export const ObjectPhotoSchema = z.object({
  /** Маленькое превью, ~200×133 */
  thumbnailUrl: z.url(),
  /** Превью побольше, ~420×280 */
  largeUrl: z.url().optional(),
  /** Страница фото у источника: обязательная ссылка рядом с картинкой */
  pageUrl: z.url(),
  photographer: z.string(),
  /** "planespotters" */
  source: z.string(),
});
export type ObjectPhoto = z.infer<typeof ObjectPhotoSchema>;

/** GET /api/objects/:id */
export const ObjectDetailsResponseSchema = z.object({
  /** Последнее известное состояние объекта, как в потоке /ws */
  object: TrackedObjectSchema,
  /** Человекочитаемое название типа: "Boeing 737-800" для B738. Нет, если тип неизвестен */
  typeName: z.string().optional(),
  /** null: фото нет или источник недоступен */
  photo: ObjectPhotoSchema.nullable(),
});
export type ObjectDetailsResponse = z.infer<typeof ObjectDetailsResponseSchema>;

export const SearchResultSchema = z.object({
  /** object: live-объект (камера + выбор), place: точка на карте (только камера) */
  kind: z.enum(["object", "place"]),
  /** Для object — id объекта, для place — стабильный id вида "airport:LHR" */
  id: z.string(),
  layer: LayerIdSchema.optional(),
  /** Главная строка: позывной, название судна, код аэропорта */
  label: z.string(),
  /** Вторая строка: тип, регистрация, город */
  description: z.string().optional(),
  position: GeoPointSchema,
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

/** GET /api/search?q=...&limit=... */
export const SearchResponseSchema = z.object({
  query: z.string(),
  results: z.array(SearchResultSchema),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

/** Найденное место для команды goto. Источник: OpenStreetMap (Nominatim) или встроенный список аэропортов */
export const GeocodeResultSchema = z.object({
  /** "osm:relation:1543125" или "airport:HND" */
  id: z.string(),
  /** Короткое имя: «Токио» */
  label: z.string(),
  /** Полное: «Токио, Япония» */
  description: z.string().optional(),
  /** country, state, city, suburb, road, building, airport... */
  kind: z.string(),
  position: GeoPointSchema,
  /** Границы места [west, south, east, north]. Бывают огромными (острова, заморские территории) */
  bbox: BBoxSchema.optional(),
  /** Рекомендуемая высота камеры над точкой, метры: подобрана по kind */
  viewAltitudeM: z.number().positive(),
});
export type GeocodeResult = z.infer<typeof GeocodeResultSchema>;

/** GET /api/geocode?q=...&lang=ru|en */
export const GeocodeResponseSchema = z.object({
  query: z.string(),
  results: z.array(GeocodeResultSchema),
  /** "nominatim" или "local" (SIMULATE=1, сбой или перегрузка Nominatim) */
  source: z.string(),
  /** Подпись, которую нужно показать рядом с результатами */
  attribution: z.string(),
});
export type GeocodeResponse = z.infer<typeof GeocodeResponseSchema>;
