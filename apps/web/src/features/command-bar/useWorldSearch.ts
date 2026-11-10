import { useEffect, useState } from "react";
import type { SearchResult } from "@spyapp/shared";
import { searchWorld } from "./api";

/** Debounce и отмена защищают подсказки от запоздавшего ответа предыдущего запроса. */
export function useWorldSearch(input: string) {
  const [state, setState] = useState<{
    query: string;
    results: SearchResult[];
    status: "loading" | "ready" | "error";
  }>({ query: "", results: [], status: "ready" });
  const match = /^(track|goto)\s+(.+)$/i.exec(input.trim());
  const query = match?.[2]?.trim() ?? "";
  const enabled =
    query.length >= 2 &&
    query.toLowerCase() !== "off" &&
    (match?.[1]?.toLowerCase() === "track" || !/^[+-]?(?:\d|[.,]\d)/.test(query));
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setState({ query, results: [], status: "loading" });
      void searchWorld(query, controller.signal)
        .then((results) => {
          if (!controller.signal.aborted) setState({ query, results, status: "ready" });
        })
        .catch(() => {
          if (!controller.signal.aborted) setState({ query, results: [], status: "error" });
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, enabled]);
  return enabled && state.query === query
    ? state
    : { results: [], status: enabled ? ("loading" as const) : ("ready" as const) };
}
