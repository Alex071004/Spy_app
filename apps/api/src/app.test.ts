import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  HealthResponseSchema,
  PROTOCOL_VERSION,
  ServerMessageSchema,
  type ServerMessage,
} from "@spyapp/shared";
import { buildApp } from "./app";
import { createAircraftSimulator } from "./layers/aircraft/connectors/simulator";
import { createVesselSimulator } from "./layers/vessels/connectors/simulator";

type App = Awaited<ReturnType<typeof buildApp>>;

/** Открывает /ws и собирает сообщения. Слушатель вешается до открытия, иначе hello теряется */
async function connect(app: App) {
  const inbox: ServerMessage[] = [];
  const waiters: { until: (m: ServerMessage[]) => boolean; resolve: () => void }[] = [];
  const ws = await app.injectWS(
    "/ws",
    {},
    {
      onInit: (socket) =>
        socket.on("message", (raw: Buffer) => {
          inbox.push(ServerMessageSchema.parse(JSON.parse(String(raw))));
          for (const w of waiters) if (w.until(inbox)) w.resolve();
        }),
    },
  );
  const waitFor = (until: (m: ServerMessage[]) => boolean) =>
    until(inbox)
      ? Promise.resolve()
      : new Promise<void>((resolve) => waiters.push({ until, resolve }));
  return { ws, inbox, waitFor };
}

describe("api", () => {
  let app: App;

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
    const { ws, inbox, waitFor } = await connect(app);
    ws.send("not json");
    await waitFor((m) => m.length >= 2);
    ws.terminate();
    expect(inbox[0]?.t).toBe("hello");
    expect(inbox[1]).toMatchObject({ t: "error", code: "bad_json" });
  });
});

describe("api в режиме симуляции", () => {
  let app: App;

  beforeAll(async () => {
    app = await buildApp({
      logLevel: "silent",
      connectors: [
        createAircraftSimulator({ count: 300, tickMs: 50 }),
        createVesselSimulator({ count: 200, tickMs: 50 }),
      ],
      hub: { tickMs: 50, keyframeMs: 100 },
    });
    await app.ready();
  });
  afterAll(() => app.close());

  it("отдаёт snap по подписке и затем дельты", async () => {
    const { ws, inbox, waitFor } = await connect(app);
    ws.send(
      JSON.stringify({
        t: "sub",
        layers: ["aircraft", "vessels"],
        bbox: [-180, -90, 180, 90],
        z: 2,
      }),
    );
    await waitFor((m) => m.some((x) => x.t === "delta"));
    ws.terminate();

    const snaps = inbox.filter((m) => m.t === "snap");
    expect(snaps.map((s) => s.layer).sort()).toEqual(["aircraft", "vessels"]);
    const aircraft = snaps.find((s) => s.layer === "aircraft");
    expect(aircraft?.t === "snap" && aircraft.items).toHaveLength(300);
  });
});
