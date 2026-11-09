import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import {
  ClientMessageSchema,
  PROTOCOL_VERSION,
  type HealthResponse,
  type ServerMessage,
} from "@spyapp/shared";

interface AppOptions {
  webOrigin?: string;
  logLevel?: string;
}

/** Сборка приложения без listen: используется сервером и тестами */
export async function buildApp(opts: AppOptions = {}) {
  const app = Fastify({ logger: { level: opts.logLevel ?? "info" } });

  await app.register(cors, { origin: opts.webOrigin ?? "http://localhost:5173" });
  await app.register(websocket);

  app.get("/health", async (): Promise<HealthResponse> => ({
    status: "ok",
    uptime: Math.round(process.uptime()),
    protocol: PROTOCOL_VERSION,
  }));

  // Заготовка стриминга (ADR-0003): подписки принимаются и валидируются, данные появятся с stream-hub
  app.register(async (scope) => {
    scope.get("/ws", { websocket: true }, (socket) => {
      const send = (msg: ServerMessage) => socket.send(JSON.stringify(msg));
      send({ t: "hello", server: "spyapp-api", protocol: PROTOCOL_VERSION, time: Date.now() });

      socket.on("message", (raw) => {
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
        app.log.debug({ msg: parsed.data }, "ws message");
      });
    });
  });

  return app;
}
