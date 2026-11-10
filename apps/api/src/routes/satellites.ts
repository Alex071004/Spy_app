import type { FastifyInstance } from "fastify";
import { SatelliteGroupSchema } from "@spyapp/shared";
import type { SatelliteSource } from "../layers/satellites/tle-source";

/** Формат ошибки REST (совпадает с ApiError из контракта B4) */
interface ApiError {
  error: string;
  message: string;
}

/** GET /api/satellites/tle?group=stations — наборы TLE для расчёта орбит на клиенте (B3) */
export function registerSatelliteRoutes(app: FastifyInstance, source: SatelliteSource) {
  app.get<{ Querystring: { group?: string } }>("/api/satellites/tle", async (req, reply) => {
    const group = SatelliteGroupSchema.safeParse(req.query.group ?? "stations");
    if (!group.success) {
      const error: ApiError = {
        error: "bad_request",
        message: `Unknown group. Use one of: ${SatelliteGroupSchema.options.join(", ")}`,
      };
      return reply.code(400).send(error);
    }
    try {
      const data = await source.get(group.data);
      // Набор меняется раз в несколько часов: браузер может держать его час
      return reply.header("cache-control", "public, max-age=3600").send(data);
    } catch (err) {
      app.log.warn({ err: (err as Error).message, group: group.data }, "satellites unavailable");
      const error: ApiError = {
        error: "unavailable",
        message: "Satellite data source is unavailable",
      };
      return reply.code(503).send(error);
    }
  });
}
