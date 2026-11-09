import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION } from "@spyapp/shared";
import { fixtureAircraft } from "@spyapp/shared/fixtures";
import { LiveClient, type LiveSocket } from "./LiveClient";

class FakeSocket implements LiveSocket {
  readyState = 1;
  sent: unknown[] = [];
  private messages: ((event: { data: unknown }) => void)[] = [];
  private signals: Record<string, (() => void)[]> = {};
  addEventListener(type: "open" | "close" | "error", listener: () => void): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: string, listener: (() => void) | ((event: { data: unknown }) => void)) {
    if (type === "message") this.messages.push(listener as (event: { data: unknown }) => void);
    else (this.signals[type] ??= []).push(listener as () => void);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
    this.emit("close");
  }
  emit(type: string) {
    for (const listener of this.signals[type] ?? []) listener();
  }
  receive(value: unknown) {
    for (const listener of this.messages)
      listener({ data: typeof value === "string" ? value : JSON.stringify(value) });
  }
}

const subscription = { layers: ["aircraft"] as const, bbox: [-10, 30, 40, 60] as const, z: 3 };
const hello = { t: "hello", server: "test", protocol: PROTOCOL_VERSION, time: 1000 };
const snap = { t: "snap", layer: "aircraft", items: fixtureAircraft };
const delta = { t: "delta", layer: "aircraft", up: fixtureAircraft, rm: [] };
const clients: LiveClient[] = [];

function harness() {
  const sockets: FakeSocket[] = [];
  const onMessage = vi.fn(),
    onState = vi.fn(),
    onIssue = vi.fn();
  const client = new LiveClient(
    {
      url: "ws://test/ws",
      onMessage,
      onState,
      onIssue,
      random: () => 0.5,
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
    },
    { layers: [...subscription.layers], bbox: [...subscription.bbox], z: subscription.z },
  );
  clients.push(client);
  client.start();
  return { client, sockets, first: sockets[0]!, onMessage, onState, onIssue };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const client of clients.splice(0)) client.stop();
  vi.useRealTimers();
});

describe("LiveClient", () => {
  it("выравнивает время измерения по hello сервера", () => {
    const h = harness();
    h.first.receive({ ...hello, time: Date.now() + 300_000 });
    expect(h.client.serverNow() - Date.now()).toBe(300_000);
    vi.advanceTimersByTime(2000);
    expect(h.client.serverNow() - Date.now()).toBe(300_000);
  });
  it("ждёт hello, затем отправляет последнюю подписку и принимает snapshot", () => {
    const h = harness();
    h.first.receive(snap);
    expect(h.onMessage).not.toHaveBeenCalled();
    expect(h.first.sent).toEqual([]);
    h.client.setSubscription(["aircraft"], { bbox: [170, -20, -170, 20], z: 5 });
    h.first.receive(hello);
    expect(h.first.sent).toEqual([
      { t: "sub", layers: ["aircraft"], bbox: [170, -20, -170, 20], z: 5 },
    ]);
    h.first.receive(snap);
    expect(h.onMessage).toHaveBeenCalledWith(snap);
    expect(h.onState).toHaveBeenLastCalledWith("live");
  });

  it("отклоняет JSON, неверные схемы и объекты другого слоя", () => {
    const h = harness();
    h.first.receive(hello);
    h.first.receive("{broken");
    h.first.receive({
      ...snap,
      items: [{ ...fixtureAircraft[0], position: { lat: 999, lon: 0 } }],
    });
    h.first.receive({ ...snap, items: [{ ...fixtureAircraft[0], layer: "vessels" }] });
    expect(h.onMessage).not.toHaveBeenCalled();
    expect(h.onIssue).toHaveBeenLastCalledWith("invalid");
    h.first.receive(snap);
    expect(h.onIssue).toHaveBeenLastCalledWith(null);
  });

  it("при несовпадении версии останавливается до перезагрузки", () => {
    const h = harness();
    h.first.receive({ ...hello, protocol: PROTOCOL_VERSION + 1 });
    h.client.setSubscription([], { bbox: [-180, -90, 180, 90], z: 0 });
    vi.advanceTimersByTime(100_000);
    expect(h.onState).toHaveBeenLastCalledWith("incompatible");
    expect(h.sockets).toHaveLength(1);
    expect(h.first.readyState).toBe(3);
    expect(h.onMessage).not.toHaveBeenCalled();
  });

  it("наращивает задержку 1/2/4 с и не дублирует retry по error + close", () => {
    const h = harness();
    h.first.emit("error");
    h.first.emit("close");
    vi.advanceTimersByTime(999);
    expect(h.sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(h.sockets).toHaveLength(2);
    h.sockets[1]!.close();
    vi.advanceTimersByTime(1999);
    expect(h.sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(h.sockets).toHaveLength(3);
    h.sockets[2]!.close();
    vi.advanceTimersByTime(4000);
    expect(h.sockets).toHaveLength(4);
  });

  it("после reconnect требует новый snapshot и игнорирует прежний сокет", () => {
    const h = harness();
    h.first.receive(hello);
    h.first.receive(snap);
    h.first.close();
    h.onMessage.mockClear();
    h.client.setSubscription(["aircraft"], { bbox: [20, 30, 40, 50], z: 6 });
    vi.advanceTimersByTime(1000);
    const next = h.sockets[1]!;
    next.receive(hello);
    expect(next.sent).toEqual([{ t: "sub", layers: ["aircraft"], bbox: [20, 30, 40, 50], z: 6 }]);
    h.first.receive(snap);
    next.receive(delta);
    expect(h.onMessage).not.toHaveBeenCalled();
    next.receive({ ...snap, items: [] });
    next.receive(delta);
    expect(h.onMessage).toHaveBeenCalledTimes(2);
  });

  it("отправляет view только при изменении камеры, sub при смене слоёв", () => {
    const h = harness();
    h.first.receive(hello);
    const view = { bbox: [-20, 20, 30, 65] as [number, number, number, number], z: 4 };
    h.client.setSubscription(["aircraft"], view);
    h.client.setSubscription(["aircraft"], view);
    h.client.setSubscription([], view);
    h.first.receive(snap);
    expect(h.first.sent).toHaveLength(3);
    expect(h.first.sent[1]).toEqual({ t: "view", ...view });
    expect(h.first.sent[2]).toEqual({ t: "sub", layers: [], ...view });
    expect(h.onMessage).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20_000);
    expect(h.sockets).toHaveLength(1);
  });

  it("восстанавливает соединение при зависшем hello или остановке потока", () => {
    const h = harness();
    vi.advanceTimersByTime(9000);
    expect(h.sockets).toHaveLength(2);
    h.sockets[1]!.receive(hello);
    h.sockets[1]!.receive(snap);
    vi.advanceTimersByTime(16_000);
    expect(h.sockets).toHaveLength(3);
    expect(h.onState).toHaveBeenLastCalledWith("reconnecting");
  });

  it("передаёт ошибку сервера и полностью отменяет таймеры при stop", () => {
    const h = harness();
    h.first.receive(hello);
    h.first.receive({ t: "error", code: "bad_message", message: "detail" });
    expect(h.onIssue).toHaveBeenLastCalledWith("server");
    h.first.close();
    h.client.stop();
    vi.advanceTimersByTime(100_000);
    expect(h.sockets).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
