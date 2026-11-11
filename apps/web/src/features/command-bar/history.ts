export const HISTORY_KEY = "spyapp.commandHistory";
const LIMIT = 12;

export function readHistory(value: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(value ?? "null");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .reduce<string[]>((items, item: unknown) => {
        if (typeof item !== "string") return items;
        const text = item.trim();
        if (
          text &&
          text.length <= 200 &&
          !items.some((previous) => previous.toLowerCase() === text.toLowerCase())
        )
          items.push(text);
        return items;
      }, [])
      .slice(0, LIMIT);
  } catch {
    return [];
  }
}

export function remember(history: string[], input: string) {
  const text = input.trim();
  return [text, ...history.filter((item) => item.toLowerCase() !== text.toLowerCase())].slice(
    0,
    LIMIT,
  );
}
