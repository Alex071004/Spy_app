import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureAircraft } from "@spyapp/shared/fixtures";
import type { SearchResult } from "@spyapp/shared";
import { loadAircraft, resolveSearchResult, searchWorld } from "./api";

afterEach(() => vi.unstubAllGlobals());
const signal = () => new AbortController().signal;
const place = (id: string, label = "London"): SearchResult => ({
  kind: "place",
  id: `airport:${id}`,
  label,
  description: `Лондон · ${id}`,
  position: { lon: 0, lat: 51 },
});

describe("контракт серверного поиска B4", () => {
  it("кодирует запрос и проверяет ответ по общей схеме", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ query: "LHR", results: [place("LHR")] }));
    vi.stubGlobal("fetch", fetcher);
    expect(await searchWorld("LHR", signal())).toEqual([place("LHR")]);
    expect(String(fetcher.mock.calls[0]![0])).toContain("/api/search?q=LHR&limit=20");
    fetcher.mockResolvedValue(
      Response.json({ query: "bad", results: [{ ...place("LHR"), position: { lon: "bad" } }] }),
    );
    await expect(searchWorld("bad", signal())).rejects.toThrow();
  });
  it("отклоняет ошибку HTTP и чужой объект из ответа", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(loadAircraft("aircraft:missing", signal())).rejects.toThrow("404");
    fetcher.mockImplementation(async () =>
      Response.json({ object: fixtureAircraft[0], photo: null }),
    );
    await expect(loadAircraft("aircraft:other", signal())).rejects.toThrow("Unexpected object");
    expect(await loadAircraft(fixtureAircraft[0]!.id, signal())).toEqual(fixtureAircraft[0]);
  });
  it("передаёт отмену в fetch", async () => {
    vi.stubGlobal(
      "fetch",
      (_url: string, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const controller = new AbortController();
    const request = searchWorld("London", controller.signal);
    controller.abort();
    await expect(request).rejects.toHaveProperty("name", "AbortError");
  });
  it("выбирает точный код аэропорта и требует уточнить неоднозначный город", () => {
    const items = [place("LHR"), place("LGW")];
    expect(resolveSearchResult(items, "lhr")?.id).toBe("airport:LHR");
    expect(resolveSearchResult(items, "london")).toBeUndefined();
    expect(resolveSearchResult([], "missing")).toBeUndefined();
  });
});
