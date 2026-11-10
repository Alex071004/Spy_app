import { bboxContains, type BBox, type LayerId, type TrackedObject } from "@spyapp/shared";

/** Чтение состояния мира: этим пользуются stream-hub и детекторы */
export interface WorldStateReader {
  get(id: string): TrackedObject | undefined;
  count(layer: LayerId): number;
  query(layer: LayerId, bbox: BBox): TrackedObject[];
  /** Все объекты слоя: для поиска и детекторов */
  values(layer: LayerId): Iterable<TrackedObject>;
}

/** Через сколько миллисекунд без обновлений объект считается пропавшим */
const DEFAULT_TTL_MS: Record<LayerId, number> = {
  // adsb.lol обновляет тихие районы раз в несколько минут (adsb-lol/scheduler.ts)
  aircraft: 180_000,
  vessels: 15 * 60_000,
  satellites: 60 * 60_000,
  events: 24 * 60 * 60_000,
  webcams: 24 * 60 * 60_000,
};

/**
 * Live-состояние мира в памяти (ADR-0004): последняя известная версия каждого объекта.
 * Пространственного индекса пока нет: линейный проход по 15k объектов занимает доли миллисекунды.
 * Индекс по тайлам добавим, когда B5 покажет, что он нужен.
 */
export class WorldState implements WorldStateReader {
  private readonly layers = new Map<LayerId, Map<string, TrackedObject>>();

  constructor(private readonly ttlMs: Record<LayerId, number> = DEFAULT_TTL_MS) {}

  private layer(id: LayerId) {
    let map = this.layers.get(id);
    if (!map) this.layers.set(id, (map = new Map()));
    return map;
  }

  upsert(items: readonly TrackedObject[]) {
    for (const item of items) this.layer(item.layer).set(item.id, item);
  }

  get(id: string) {
    for (const map of this.layers.values()) {
      const item = map.get(id);
      if (item) return item;
    }
    return undefined;
  }

  count(layer: LayerId) {
    return this.layers.get(layer)?.size ?? 0;
  }

  values(layer: LayerId): Iterable<TrackedObject> {
    return this.layers.get(layer)?.values() ?? [];
  }

  query(layer: LayerId, bbox: BBox) {
    const result: TrackedObject[] = [];
    for (const item of this.layers.get(layer)?.values() ?? []) {
      if (bboxContains(bbox, item.position.lon, item.position.lat)) result.push(item);
    }
    return result;
  }

  /** Удаляет объекты, от которых давно не было данных. Возвращает число удалённых */
  sweep(now: number) {
    let removed = 0;
    for (const [layer, map] of this.layers) {
      const deadline = now - this.ttlMs[layer];
      for (const [id, item] of map) {
        if (item.updatedAt < deadline) {
          map.delete(id);
          removed++;
        }
      }
    }
    return removed;
  }
}
