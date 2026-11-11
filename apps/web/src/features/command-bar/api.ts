import {
  ObjectDetailsResponseSchema,
  SearchResponseSchema,
  type SearchResult,
} from "@spyapp/shared";

const baseUrl = (import.meta.env.VITE_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
export class ApiRequestError extends Error {
  constructor(readonly status: number) {
    super(`API ${status}`);
  }
}

async function get(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(`${baseUrl}${path}`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
  });
  if (!response.ok) throw new ApiRequestError(response.status);
  return response.json();
}

export async function searchWorld(query: string, signal: AbortSignal) {
  const q = query.replace(/^aircraft:/i, "");
  if (q.trim().length < 2) return [];
  const response = SearchResponseSchema.parse(
    await get(`/api/search?${new URLSearchParams({ q, limit: "20" })}`, signal),
  );
  return response.results;
}

export async function loadAircraft(id: string, signal: AbortSignal) {
  const response = ObjectDetailsResponseSchema.parse(
    await get(`/api/objects/${encodeURIComponent(id)}`, signal),
  );
  if (response.object.layer !== "aircraft" || response.object.id !== id)
    throw new Error("Unexpected object");
  return response.object;
}

export function resolveSearchResult(results: SearchResult[], query: string) {
  const needle = query.trim().toLowerCase();
  const exact = results.filter((result) =>
    [
      result.id,
      result.id.split(":").at(-1),
      result.label,
      ...(result.description?.split(" · ") ?? []),
    ].some((field) => field?.toLowerCase() === needle),
  );
  return exact.length === 1
    ? exact[0]
    : exact.length === 0 && results.length === 1
      ? results[0]
      : undefined;
}
