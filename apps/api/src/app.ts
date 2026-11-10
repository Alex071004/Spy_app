import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import {
  ClientMessageSchema,
  PROTOCOL_VERSION,
  type HealthResponse,
  type ServerMessage,
} from "@spyapp/shared";
import type { Connector } from "./core/connector";
import { StreamHub, type StreamHubOptions } from "./core/stream-hub";
import { WorldState } from "./core/world-state";
import { createPlanespottersPhotos, type AircraftPhotoProvider } from "./layers/aircraft/photos";
import { registerRestRoutes } from "./routes/rest";

interface AppOptions {
  webOrigin?: string;
  logLevel?: string;
  connectors?: Connector[];
  hub?: StreamHubOptions;
  /** Источник фото для досье. По умолчанию Planespotters */
  photos?: AircraftPhotoProvider;
  /** Как часто удалять пропавшие объекты */
  sweepMs?: number;
}

/** Клиент не успевает читать: пропускаем для него тик, а не копим очередь */
const MAX_BUFFERED_BYTES = 2 * 1024 * 1024;

/** Сборка приложения без listen: используется сервером и тестами */
export async function buildApp(opts: AppOptions = {}) {
  const app = Fastify({ logger: { level: opts.logLevel ?? "info" } });
  const world = new WorldState();
  const hub = new StreamHub(world, opts.hub);
  const connectors = opts.connectors ?? [];
  let sweepTimer: ReturnType<typeof setInterval> | undefined;

  await app.register(cors, { origin: opts.webOrigin ?? "http://localhost:5173" });
  await app.register(websocket);

  app.addHook("onReady", async () => {
    for (const connector of connectors) {
      await connector.start({
        upsert: (items) => world.upsert(items),
        views: () => hub.views(connector.layer),
        log: app.log.child({ connector: connector.id }),
      });
    }
    hub.start();
    sweepTimer = setInterval(() => world.sweep(Date.now()), opts.sweepMs ?? 5_000);
  });

  app.addHook("onClose", async () => {
    hub.stop();
    clearInterval(sweepTimer);
    for (const connector of connectors) await connector.stop();
  });

  app.get("/health", async (): Promise<HealthResponse> => ({
    status: "ok",
    uptime: Math.round(process.uptime()),
    protocol: PROTOCOL_VERSION,
  }));

  registerRestRoutes(app, { world, photos: opts.photos ?? createPlanespottersPhotos() });

  app.register(async (scope) => {
    scope.get("/ws", { websocket: true }, (socket) => {
      const send = (msg: ServerMessage) => socket.send(JSON.stringify(msg));
      const client = hub.addClient(send, () => socket.bufferedAmount > MAX_BUFFERED_BYTES);
      send({ t: "hello", server: "spyapp-api", protocol: PROTOCOL_VERSION, time: Date.now() });

      socket.on("message", (raw: Buffer) => {
        let data: unknown;
        try {
          data = JSON.parse(String(raw));
        } catch {
          return send({ t: "error", code: "bad_json", message: "Message is not valid JSON" });
        }
        const parsed = ClientMessageSchema.safeParse(data);
        if (!parsed.success) {
          return send({ t: "error", code: "bad_message", message: parsed.error.message });
        }
        client.handle(parsed.data);
      });
      socket.on("close", () => client.close());
    });
  });

  return app;
}
