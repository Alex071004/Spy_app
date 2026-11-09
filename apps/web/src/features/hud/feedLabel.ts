import type { AircraftFeedState } from "../../layers/aircraft/state";

export function feedLabel(feed: AircraftFeedState, active: boolean) {
  if (feed.connection === "incompatible") return "feed.incompatible";
  if (!active) return "feed.disabled";
  if (feed.mode === "stream" && feed.connection !== "live")
    return feed.connection === "waiting" ? "feed.waiting" : "feed.stale";
  if (feed.issue) return `feed.${feed.issue}`;
  if (feed.mode === "demo") return "feed.demo";
  return feed.connection === "live"
    ? feed.simulated
      ? "feed.simulated"
      : "feed.live"
    : feed.connection === "waiting"
      ? "feed.waiting"
      : "feed.stale";
}
