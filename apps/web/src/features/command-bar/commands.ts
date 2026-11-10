import { LAYER_IDS, type LayerId } from "@spyapp/shared";

export const destinations = [
  { id: "tokyo", aliases: ["tokyo", "токио"], lat: 35.68, lon: 139.69 },
  { id: "moscow", aliases: ["moscow", "москва"], lat: 55.75, lon: 37.62 },
  { id: "london", aliases: ["london", "лондон"], lat: 51.51, lon: -0.13 },
  { id: "newYork", aliases: ["new york", "нью-йорк"], lat: 40.71, lon: -74.01 },
] as const;

export type Command =
  | { kind: "track"; query: string }
  | { kind: "stop" }
  | { kind: "goto"; lat: number; lon: number; height: number }
  | { kind: "layer"; id: LayerId; mode: "on" | "off" | "toggle" };
export type CommandError = "unknown" | "trackUsage" | "gotoUsage" | "coordinates" | "layerUsage";
export type ParseResult = { command: Command } | { error: CommandError };

export function parseCommand(input: string): ParseResult {
  const [verb, ...args] = input.trim().split(/\s+/);
  const rest = args.join(" ");
  switch (verb?.toLowerCase()) {
    case "track":
      if (!rest) return { error: "trackUsage" };
      return {
        command: rest.toLowerCase() === "off" ? { kind: "stop" } : { kind: "track", query: rest },
      };
    case "goto": {
      const destination = destinations.find((place) =>
        place.aliases.some((alias) => alias === rest.toLowerCase()),
      );
      if (destination)
        return {
          command: { kind: "goto", lat: destination.lat, lon: destination.lon, height: 750_000 },
        };
      if (args.length < 2 || args.length > 3) return { error: "gotoUsage" };
      if (!args.every((arg) => /^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(arg)))
        return { error: "coordinates" };
      const lat = Number(args[0]!.replace(",", "."));
      const lon = Number(args[1]!.replace(",", "."));
      const km = args[2] ? Number(args[2].replace(",", ".")) : 750;
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        !Number.isFinite(km) ||
        Math.abs(lat) > 90 ||
        Math.abs(lon) > 180 ||
        km < 0.3 ||
        km > 45_000
      )
        return { error: "coordinates" };
      return { command: { kind: "goto", lat, lon, height: km * 1000 } };
    }
    case "layer": {
      const id = args[0]?.toLowerCase();
      const mode = args[1]?.toLowerCase() ?? "toggle";
      if (
        args.length > 2 ||
        !LAYER_IDS.some((layer) => layer === id) ||
        !["on", "off", "toggle"].includes(mode)
      )
        return { error: "layerUsage" };
      return {
        command: { kind: "layer", id: id as LayerId, mode: mode as "on" | "off" | "toggle" },
      };
    }
    default:
      return { error: "unknown" };
  }
}
