import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import type { ServerMessage } from "@spyapp/shared";

try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  // .env необязателен: переменные могут прийти из окружения
}

const port = Number(process.env.API_PORT ?? 4000);
const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

await app.register(cors, { origin: process.env.WEB_ORIGIN ?? "http://localhost:5173" });
await app.register(websocket);

app.get("/health", async () => ({ status: "ok", uptime: Math.round(process.uptime()) }));

// Заготовка стриминга (ADR-0003): в фазе 1 здесь появится stream-hub
app.register(async (scope) => {
  scope.get("/ws", { websocket: true }, (socket) => {
    const hello: ServerMessage = { t: "hello", server: "spyapp-api", time: Date.now() };
    socket.send(JSON.stringify(hello));
  });
});

await app.listen({ port, host: "0.0.0.0" });
