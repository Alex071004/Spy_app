/**
 * Нагрузочный тест /ws (B5): N клиентов подписываются на вид и слушают поток.
 * Считает реальные байты на проводе (после сжатия) и объём JSON до сжатия.
 *
 *   pnpm --filter @spyapp/api load -- --clients 20 --seconds 20 --view world
 *
 * Вид: world (z=2), europe (z=5), city (Лондон, z=9). --no-deflate выключает сжатие на клиенте.
 *
 * Сервер запускайте отдельно, например с SIMULATE=1.
 */
import { parseArgs } from "node:util";
import WebSocket from "ws";
import type { BBox, ClientMessage } from "@spyapp/shared";

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "ws://localhost:4000/ws" },
    clients: { type: "string", default: "20" },
    seconds: { type: "string", default: "20" },
    view: { type: "string", default: "world" },
    deflate: { type: "boolean", default: true },
    "no-deflate": { type: "boolean", default: false },
    warmup: { type: "string", default: "8" },
  },
});

const VIEWS: Record<string, { bbox: BBox; z: number }> = {
  world: { bbox: [-180, -90, 180, 90], z: 2 },
  europe: { bbox: [-12, 35, 30, 60], z: 5 },
  city: { bbox: [-0.6, 51.3, 0.3, 51.7], z: 9 },
};
const selected = VIEWS[values.view];
if (!selected) throw new Error(`Unknown view ${values.view}: ${Object.keys(VIEWS).join(", ")}`);
// Отдельная константа с явным типом: внутри функций сужение типа после проверки теряется
const view: { bbox: BBox; z: number } = selected;

const clients = Number(values.clients);
const seconds = Number(values.seconds);
/** Первые секунды уходят на snap, их меряем отдельно. При 20+ клиентах snap мира идёт несколько секунд */
const WARMUP_MS = Number(values.warmup) * 1_000;
const deflate = values.deflate && !values["no-deflate"];

interface Stats {
  wireStart: number;
  wireEnd: number;
  payload: number;
  messages: number;
  snapPayload: number;
  extensions: string;
}

async function runClient(): Promise<Stats> {
  const ws = new WebSocket(values.url, { perMessageDeflate: deflate });
  const stats: Stats = {
    wireStart: 0,
    wireEnd: 0,
    payload: 0,
    messages: 0,
    snapPayload: 0,
    extensions: "",
  };
  let measuring = false;
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  stats.extensions = ws.extensions || "none";
  ws.on("message", (data: Buffer) => {
    if (measuring) {
      stats.payload += data.length;
      stats.messages++;
    } else if (data.includes('"t":"snap"')) {
      stats.snapPayload += data.length;
    }
  });
  const sub: ClientMessage = { t: "sub", layers: ["aircraft", "vessels"], ...view };
  ws.send(JSON.stringify(sub));
  await new Promise((r) => setTimeout(r, WARMUP_MS));
  // bytesRead считает сырые байты TCP, то есть то, что реально прошло по сети
  const socket = (ws as unknown as { _socket: { bytesRead: number } })._socket;
  stats.wireStart = socket.bytesRead;
  measuring = true;
  await new Promise((r) => setTimeout(r, seconds * 1_000));
  stats.wireEnd = socket.bytesRead;
  ws.close();
  return stats;
}

const results = await Promise.all(Array.from({ length: clients }, runClient));
const kb = (bytes: number) => (bytes / 1024).toFixed(1);
const wire = results.reduce((s, r) => s + (r.wireEnd - r.wireStart), 0) / clients / seconds;
const payload = results.reduce((s, r) => s + r.payload, 0) / clients / seconds;
const snap = results.reduce((s, r) => s + r.snapPayload, 0) / clients;

console.log(
  JSON.stringify(
    {
      view: values.view,
      clients,
      seconds,
      extensions: results[0]?.extensions,
      snapJsonKB: kb(snap),
      perClientJsonKBps: kb(payload),
      perClientWireKBps: kb(wire),
      compressionRatio: payload && wire ? (payload / wire).toFixed(1) : "n/a",
      serverEgressMbps: ((wire * clients * 8) / 1_000_000).toFixed(2),
    },
    null,
    2,
  ),
);
