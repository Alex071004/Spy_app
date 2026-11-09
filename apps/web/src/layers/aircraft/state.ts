import type { ConnectionState, StreamIssue } from "../../engine/LiveClient";

export interface AircraftFeedState {
  connection: ConnectionState;
  mode: "demo" | "stream";
  simulated: boolean;
  issue: StreamIssue;
}

export const initialFeedState: AircraftFeedState = {
  connection: "connecting",
  mode: "demo",
  simulated: true,
  issue: null,
};
