import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ApiError } from "@spyapp/shared";
import type { Geocoder } from "../geocode/geocoder";

const GeocodeQuerySchema = z.object({
  q: z.string().trim().min(2).max(200),
  lang: z.enum(["ru", "en"]).default("ru"),
});

/** GET /api/geocode?q=Токио&lang=ru — поиск любых мест для goto (B6). Только по явному действию пользователя */
export function registerGeocodeRoutes(app: FastifyInstance, geocoder: Geocoder) {
  app.get("/api/geocode", async (req, reply) => {
    const parsed = GeocodeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const error: ApiError = { error: "bad_request", message: parsed.error.message };
      return reply.code(400).send(error);
    }
    return geocoder.geocode(parsed.data.q, parsed.data.lang);
  });
}
