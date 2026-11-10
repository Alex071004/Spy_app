import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ApiError, ObjectDetailsResponse, ObjectPhoto, SearchResponse } from "@spyapp/shared";
import { search } from "../core/search";
import type { WorldStateReader } from "../core/world-state";
import { aircraftTypeName } from "../layers/aircraft/aircraft-types";
import { AIRPORTS } from "../layers/aircraft/airports";
import type { AircraftPhotoProvider } from "../layers/aircraft/photos";

interface RestDeps {
  world: WorldStateReader;
  photos: AircraftPhotoProvider;
}

const SearchQuerySchema = z.object({
  q: z.string().max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const notFound = (message: string): ApiError => ({ error: "not_found", message });
const badRequest = (message: string): ApiError => ({ error: "bad_request", message });

/** REST поверх состояния мира. Контракт ответов: packages/shared/src/api.ts */
export function registerRestRoutes(app: FastifyInstance, { world, photos }: RestDeps) {
  app.get<{ Params: { id: string } }>("/api/objects/:id", async (req, reply) => {
    const object = world.get(req.params.id);
    if (!object)
      return reply.code(404).send(notFound(`Object ${req.params.id} is not tracked now`));

    const response: ObjectDetailsResponse = { object, photo: null };
    if (object.layer === "aircraft") {
      const type = typeof object.props.type === "string" ? object.props.type : undefined;
      const typeName = aircraftTypeName(type);
      if (typeName) response.typeName = typeName;
      // У симулятора вымышленные hex и регистрации: внешний сервис не дёргаем
      if (object.source !== "simulator")
        response.photo = await findPhoto(app, photos, object.id, object.props);
    }
    return response;
  });

  app.get("/api/search", async (req, reply) => {
    const parsed = SearchQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send(badRequest(parsed.error.message));
    const { q, limit } = parsed.data;
    const response: SearchResponse = { query: q, results: search(world, AIRPORTS, q, { limit }) };
    return response;
  });
}

async function findPhoto(
  app: FastifyInstance,
  photos: AircraftPhotoProvider,
  id: string,
  props: Record<string, unknown>,
): Promise<ObjectPhoto | null> {
  const hex = id.slice(id.indexOf(":") + 1).replace(/^~/, "");
  const registration = typeof props.registration === "string" ? props.registration : undefined;
  try {
    return await photos.find(hex, registration);
  } catch (err) {
    // Фото не критично для досье: при сбое источника отвечаем без него
    app.log.warn({ err: (err as Error).message, id }, "photo lookup failed");
    return null;
  }
}
