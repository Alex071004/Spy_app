import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HealthResponseSchema, PROTOCOL_VERSION, ServerMessageSchema } from "@spyapp/shared";
import { buildApp } from "./app";

describe("api", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ logLevel: "silent" });
    await app.ready();
  });
  afterAll(() => app.close());

  it("GET /health отвечает по контракту", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = HealthResponseSchema.parse(res.json());
    expect(body.protocol).toBe(PROTOCOL_VERSION);
  });

  it("/ws здоровается и отклоняет кривые сообщения", async () => {
    const messages: unknown[] = [];
    let done!: () => void;
    const twoMessages = new Promise<void>((resolve) => (done = resolve));
    // Слушатель вешается до открытия сокета, иначе hello приходит раньше подписки
    const ws = await app.injectWS(
      "/ws",
      {},
      {
        onInit: (socket) =>
          socket.on("message", (raw) => {
            messages.push(JSON.parse(String(raw)));
            if (messages.length === 2) done();
          }),
      },
    );
    ws.send("not json");
    await twoMessages;
    ws.terminate();

    const [hello, error] = messages.map((m) => ServerMessageSchema.parse(m));
    expect(hello?.t).toBe("hello");
    expect(error).toMatchObject({ t: "error", code: "bad_json" });
  });
});
