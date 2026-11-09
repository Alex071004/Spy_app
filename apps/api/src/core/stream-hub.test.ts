import { describe, expect, it } from "vitest";
import type { ServerMessage, TrackedObject } from "@spyapp/shared";
import { StreamHub } from "./stream-hub";
import { WorldState } from "./world-state";

const WORLD: [number, number, number, number] = [-180, -90, 180, 90];

function plane(id: string, lon: number, lat: number, updatedAt = 0, heading = 90): TrackedObject {
  return {
    id: `aircraft:${id}`,
    layer: "aircraft",
    position: { lon, lat, alt: 10_000 },
    heading,
    speed: 240,
    updatedAt,
    source: "test",
    props: {},
  };
}

function setup(opts: ConstructorParameters<typeof StreamHub>[1] = {}) {
  const world = new WorldState();
  const hub = new StreamHub(world, { keyframeMs: 5_000, ...opts });
  const inbox: ServerMessage[] = [];
  const client = hub.addClient((msg) => inbox.push(msg));
  return { world, hub, inbox, client };
}

describe("WorldState", () => {
  it("ищет по рамке и удаляет устаревшие объекты", () => {
    const world = new WorldState();
    world.upsert([plane("a", 0, 0, 1_000), plane("b", 100, 0, 100_000)]);
    expect(world.query("aircraft", [-10, -10, 10, 10]).map((o) => o.id)).toEqual(["aircraft:a"]);
    expect(world.sweep(100_000)).toBe(1);
    expect(world.count("aircraft")).toBe(1);
    expect(world.get("aircraft:b")).toBeDefined();
  });
});

describe("StreamHub", () => {
  it("на sub присылает snap только по видимой области", () => {
    const { world, inbox, client } = setup();
    world.upsert([plane("in", 5, 5), plane("out", 50, 50)]);
    client.handle({ t: "sub", layers: ["aircraft"], bbox: [0, 0, 10, 10], z: 5 });
    expect(inbox).toEqual([{ t: "snap", layer: "aircraft", items: [plane("in", 5, 5)] }]);
  });

  it("шлёт дельты: новые, удалённые, но не мелкие обновления раньше keyframe", () => {
    const { world, hub, inbox, client } = setup();
    world.upsert([plane("a", 1, 1, 0), plane("b", 2, 2, 0)]);
    client.handle({ t: "sub", layers: ["aircraft"], bbox: WORLD, z: 2 });
    inbox.length = 0;

    // a сдвинулся немного (тот же курс, 1 с спустя), b пропал, c появился
    const world2 = [plane("a", 1.01, 1, 1_000), plane("c", 3, 3, 1_000)];
    world.sweep(Number.MAX_SAFE_INTEGER);
    world.upsert(world2);
    hub.tick();
    expect(inbox).toEqual([
      { t: "delta", layer: "aircraft", up: [plane("c", 3, 3, 1_000)], rm: ["aircraft:b"] },
    ]);

    // Через 5 с a пересылается как keyframe, а резкий поворот отправляется сразу
    inbox.length = 0;
    world.upsert([plane("a", 1.05, 1, 5_000), plane("c", 3, 3, 2_000, 180)]);
    hub.tick();
    const delta = inbox[0];
    expect(delta?.t === "delta" && delta.up.map((o) => o.id).sort()).toEqual([
      "aircraft:a",
      "aircraft:c",
    ]);
  });

  it("на view шлёт дельту сразу, без ожидания тика", () => {
    const { world, inbox, client } = setup();
    world.upsert([plane("west", -50, 0), plane("east", 50, 0)]);
    client.handle({ t: "sub", layers: ["aircraft"], bbox: [-60, -10, -40, 10], z: 5 });
    inbox.length = 0;
    client.handle({ t: "view", bbox: [40, -10, 60, 10], z: 5 });
    expect(inbox).toEqual([
      { t: "delta", layer: "aircraft", up: [plane("east", 50, 0)], rm: ["aircraft:west"] },
    ]);
  });

  it("прореживает слой на мелком зуме стабильно от тика к тику", () => {
    const { world, hub, inbox, client } = setup({ limitForZoom: () => 100 });
    world.upsert(Array.from({ length: 1_000 }, (_, i) => plane(String(i), (i % 360) - 180, 0)));
    client.handle({ t: "sub", layers: ["aircraft"], bbox: WORLD, z: 1 });
    const snap = inbox[0];
    const size = snap?.t === "snap" ? snap.items.length : 0;
    expect(size).toBeGreaterThan(50);
    expect(size).toBeLessThan(150);
    inbox.length = 0;
    hub.tick();
    expect(inbox).toEqual([]);
  });

  it("при смене подписки очищает отписанный слой пустым snap", () => {
    const { inbox, client } = setup();
    client.handle({ t: "sub", layers: ["aircraft", "vessels"], bbox: WORLD, z: 2 });
    inbox.length = 0;
    client.handle({ t: "sub", layers: ["vessels"], bbox: WORLD, z: 2 });
    expect(inbox).toEqual([
      { t: "snap", layer: "aircraft", items: [] },
      { t: "snap", layer: "vessels", items: [] },
    ]);
  });

  it("view без sub возвращает ошибку", () => {
    const { inbox, client } = setup();
    client.handle({ t: "view", bbox: WORLD, z: 2 });
    expect(inbox[0]).toMatchObject({ t: "error", code: "no_subscription" });
  });

  it("пропускает тик для занятого клиента", () => {
    const world = new WorldState();
    const hub = new StreamHub(world);
    const inbox: ServerMessage[] = [];
    let busy = false;
    const client = hub.addClient(
      (m) => inbox.push(m),
      () => busy,
    );
    client.handle({ t: "sub", layers: ["aircraft"], bbox: WORLD, z: 2 });
    inbox.length = 0;
    world.upsert([plane("a", 0, 0)]);
    busy = true;
    hub.tick();
    expect(inbox).toEqual([]);
    busy = false;
    hub.tick();
    expect(inbox).toHaveLength(1);
  });
});
