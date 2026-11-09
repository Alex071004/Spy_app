import { describe, expect, it } from "vitest";
import { ClientMessageSchema, ServerMessageSchema, TrackedObjectSchema } from "./index";
import { fixtureAircraft, fixtureVessels } from "./fixtures";

describe("fixtures", () => {
  it("соответствуют схеме TrackedObject", () => {
    for (const item of [...fixtureAircraft, ...fixtureVessels]) {
      expect(TrackedObjectSchema.safeParse(item).success).toBe(true);
    }
  });
});

describe("ClientMessageSchema", () => {
  it("принимает подписку", () => {
    const msg = { t: "sub", layers: ["aircraft"], bbox: [-10, 40, 10, 60], z: 4 };
    expect(ClientMessageSchema.parse(msg)).toEqual(msg);
  });

  it("принимает рамку через антимеридиан", () => {
    const msg = { t: "view", bbox: [170, -10, -170, 10], z: 5 };
    expect(ClientMessageSchema.safeParse(msg).success).toBe(true);
  });

  it("отклоняет неизвестный слой и координаты вне диапазона", () => {
    expect(
      ClientMessageSchema.safeParse({ t: "sub", layers: ["ufo"], bbox: [0, 0, 1, 1], z: 1 })
        .success,
    ).toBe(false);
    expect(ClientMessageSchema.safeParse({ t: "view", bbox: [0, 95, 1, 1], z: 1 }).success).toBe(
      false,
    );
  });
});

describe("ServerMessageSchema", () => {
  it("принимает дельту", () => {
    const msg = { t: "delta", layer: "aircraft", up: fixtureAircraft, rm: ["aircraft:old"] };
    expect(ServerMessageSchema.safeParse(msg).success).toBe(true);
  });
});
