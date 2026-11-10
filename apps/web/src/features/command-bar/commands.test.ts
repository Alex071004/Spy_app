import { describe, expect, it } from "vitest";
import { parseCommand } from "./commands";
import { readHistory, remember } from "./history";

describe("командная строка", () => {
  it("читает координаты, десятичную запятую и высоту в километрах", () => {
    expect(parseCommand(" GOTO -12,5 +179.9 1.5 ")).toEqual({
      command: { kind: "goto", lat: -12.5, lon: 179.9, height: 1500 },
    });
    expect(parseCommand("goto -90 180")).toEqual({
      command: { kind: "goto", lat: -90, lon: 180, height: 750_000 },
    });
  });
  it.each([
    "goto 91 0",
    "goto 0 -181",
    "goto NaN 0",
    "goto 0 Infinity",
    "goto 0 0 0",
    "goto 0 0 45001",
    "goto 0x10 1",
    "goto 1e2 0",
    "goto 0 0 3x",
  ])("отклоняет небезопасные координаты: %s", (input) => {
    expect(parseCommand(input)).toEqual({ error: "coordinates" });
  });
  it("различает города, ID бортов, остановку и режимы слоёв", () => {
    expect(parseCommand("goto Нью-Йорк")).toEqual(parseCommand("goto new york"));
    expect(parseCommand("track SIM-123")).toEqual({ command: { kind: "track", query: "SIM-123" } });
    expect(parseCommand("TRACK OFF")).toEqual({ command: { kind: "stop" } });
    expect(parseCommand("layer AIRCRAFT OFF")).toEqual({
      command: { kind: "layer", id: "aircraft", mode: "off" },
    });
    expect(parseCommand("layer vessels")).toEqual({
      command: { kind: "layer", id: "vessels", mode: "toggle" },
    });
  });
  it.each([
    "",
    "rm all",
    "track",
    "goto tokyo extra",
    "goto 1 2 3 4",
    "layer bogus",
    "layer aircraft yes",
    "layer aircraft on extra",
  ])("не исполняет неполную или неизвестную команду: %s", (input) => {
    expect(parseCommand(input)).toHaveProperty("error");
  });
});

describe("локальная история", () => {
  it("переживает повреждённые данные и отбрасывает мусор", () => {
    expect(readHistory("{broken")).toEqual([]);
    expect(readHistory('{"command":"track off"}')).toEqual([]);
    expect(
      readHistory(
        JSON.stringify([null, 3, "", " goto tokyo ", "GOTO TOKYO", "x".repeat(201), "track off"]),
      ),
    ).toEqual(["goto tokyo", "track off"]);
  });
  it("поднимает повторную команду наверх и ограничивает историю", () => {
    const history = Array.from({ length: 20 }, (_, i) => `track ${i}`);
    expect(remember(history, " TRACK 3 ")).toEqual([
      "TRACK 3",
      ...history.filter((text) => text !== "track 3").slice(0, 11),
    ]);
    expect(readHistory(JSON.stringify(history))).toHaveLength(12);
  });
});
