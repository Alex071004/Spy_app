import { describe, expect, it } from "vitest";
import { fixtureAircraft } from "@spyapp/shared/fixtures";
import type { TrackedObject } from "@spyapp/shared";
import { aircraftLabel, resolveAircraft, searchAircraft } from "./search";

function object(id: string, callsign: unknown, registration = ""): TrackedObject {
  return { ...fixtureAircraft[0]!, id, props: { callsign, registration } };
}
describe("поиск загруженных бортов", () => {
  const objects = [object("a", "TEST123"), object("b", "TEST1234"), object("c", "OTHER", "N-TEST")];
  it("ищет без учёта регистра по ID, позывному и регистрации", () => {
    expect(searchAircraft(objects, "test").map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(resolveAircraft(objects, " test123 ")?.id).toBe("a");
    expect(resolveAircraft(objects, "n-test")?.id).toBe("c");
    expect(resolveAircraft(objects, "B")?.id).toBe("b");
  });
  it("не выбирает случайный борт при неоднозначности", () => {
    expect(resolveAircraft(objects, "test")).toBeUndefined();
    expect(resolveAircraft([object("a", "SAME"), object("b", "SAME")], "same")).toBeUndefined();
    expect(resolveAircraft(objects, "missing")).toBeUndefined();
    expect(resolveAircraft([objects[0]!], "test", true)).toBeUndefined();
    expect(resolveAircraft(objects, "")).toBeUndefined();
  });
  it("отдаёт приоритет точному ID и ограничивает подсказки", () => {
    const items = Array.from({ length: 30 }, (_, i) => object(`id-${i}`, "ID-29"));
    expect(resolveAircraft(items, "id-29")?.id).toBe("id-29");
    expect(searchAircraft(items.values(), "")).toHaveLength(8);
  });
  it("сохраняет поиск по ID при невалидных props", () => {
    const invalid = object("invalid", 123);
    expect(aircraftLabel(invalid)).toBe("invalid");
    expect(resolveAircraft([invalid], "invalid")).toBe(invalid);
  });
});
