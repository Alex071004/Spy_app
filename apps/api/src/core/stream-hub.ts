import type { BBox, ClientMessage, LayerId, ServerMessage, TrackedObject } from "@spyapp/shared";
import type { WorldStateReader } from "./world-state";

interface Subscription {
  layers: Set<LayerId>;
  bbox: BBox;
  z: number;
}

/** Что последнее мы отправили клиенту по объекту: по этому решаем, слать ли обновление */
interface SentInfo {
  updatedAt: number;
  heading: number | undefined;
  speed: number | undefined;
}

interface ClientState {
  send: (msg: ServerMessage) => void;
  isBusy: () => boolean;
  sub: Subscription | null;
  sent: Map<LayerId, Map<string, SentInfo>>;
}

export interface StreamHubOptions {
  /** Как часто считаются и рассылаются дельты */
  tickMs?: number;
  /**
   * Объект без резких изменений пересылается не чаще этого интервала:
   * между обновлениями клиент сам ведёт его по курсу и скорости (deadReckon).
   * Число задаёт интервал для всех слоёв, объект переопределяет отдельные слои
   */
  keyframeMs?: number | Partial<Record<LayerId, number>>;
  /** Сколько объектов слоя отдавать клиенту на данном зуме */
  limitForZoom?: (z: number) => number;
}

export interface HubClient {
  handle(msg: ClientMessage): void;
  close(): void;
}

const HEADING_THRESHOLD_DEG = 3;
const SPEED_THRESHOLD = 0.1;

/** Суда идут медленно и прямо: за 30 с ошибка ведения по курсу десятки метров */
const DEFAULT_KEYFRAME_MS: Partial<Record<LayerId, number>> = { aircraft: 5_000, vessels: 30_000 };
const FALLBACK_KEYFRAME_MS = 5_000;

function defaultLimit(z: number) {
  if (z < 4) return 2_500;
  if (z < 6) return 4_000;
  return 8_000;
}

/** Стабильное число в [0, 1) по id: прореживание оставляет одни и те же объекты от тика к тику */
function idFraction(id: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Перемешивание murmur3: у похожих id (aircraft:1, aircraft:2) FNV даёт близкие значения
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0x1_0000_0000;
}

function headingDelta(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Рассылка live-данных по подпискам (ADR-0003): каждый клиент получает только то,
 * что видит, и только то, что изменилось.
 */
export class StreamHub {
  private readonly clients = new Set<ClientState>();
  private readonly tickMs: number;
  private readonly keyframeMs: Partial<Record<LayerId, number>>;
  private readonly defaultKeyframeMs: number;
  private readonly limitForZoom: (z: number) => number;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly world: WorldStateReader,
    opts: StreamHubOptions = {},
  ) {
    this.tickMs = opts.tickMs ?? 1_000;
    const keyframe = opts.keyframeMs ?? DEFAULT_KEYFRAME_MS;
    this.keyframeMs = typeof keyframe === "number" ? {} : keyframe;
    this.defaultKeyframeMs = typeof keyframe === "number" ? keyframe : FALLBACK_KEYFRAME_MS;
    this.limitForZoom = opts.limitForZoom ?? defaultLimit;
  }

  get clientCount() {
    return this.clients.size;
  }

  start() {
    this.timer ??= setInterval(() => this.tick(), this.tickMs);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  addClient(send: ClientState["send"], isBusy: ClientState["isBusy"] = () => false): HubClient {
    const client: ClientState = { send, isBusy, sub: null, sent: new Map() };
    this.clients.add(client);
    return {
      handle: (msg) => this.handle(client, msg),
      close: () => this.clients.delete(client),
    };
  }

  /** Области, которые клиенты смотрят на слое с зумом не меньше minZoom (общий вид Земли не в счёт) */
  views(layer: LayerId, minZoom = 4): BBox[] {
    const result: BBox[] = [];
    for (const { sub } of this.clients) {
      if (sub && sub.z >= minZoom && sub.layers.has(layer)) result.push(sub.bbox);
    }
    return result;
  }

  /** Один шаг рассылки. Публичный, чтобы тесты не ждали таймер */
  tick() {
    for (const client of this.clients) {
      if (client.sub && !client.isBusy()) this.flush(client, client.sub);
    }
  }

  private handle(client: ClientState, msg: ClientMessage) {
    if (msg.t === "sub") {
      const previous = client.sub?.layers ?? new Set<LayerId>();
      const sub: Subscription = { layers: new Set(msg.layers), bbox: msg.bbox, z: msg.z };
      client.sub = sub;
      // snap заменяет состояние слоя целиком, поэтому отписанные слои очищаем пустым snap
      for (const layer of previous) {
        if (!sub.layers.has(layer)) {
          client.sent.delete(layer);
          client.send({ t: "snap", layer, items: [] });
        }
      }
      for (const layer of sub.layers) this.snap(client, sub, layer);
      return;
    }
    if (!client.sub) {
      client.send({ t: "error", code: "no_subscription", message: "Send sub before view" });
      return;
    }
    client.sub = { ...client.sub, bbox: msg.bbox, z: msg.z };
    this.flush(client, client.sub);
  }

  private visible(sub: Subscription, layer: LayerId) {
    const items = this.world.query(layer, sub.bbox);
    const limit = this.limitForZoom(sub.z);
    if (items.length <= limit) return items;
    const keep = limit / items.length;
    return items.filter((item) => idFraction(item.id) < keep);
  }

  private snap(client: ClientState, sub: Subscription, layer: LayerId) {
    const items = this.visible(sub, layer);
    const sent = new Map<string, SentInfo>();
    for (const item of items) sent.set(item.id, this.sentInfo(item));
    client.sent.set(layer, sent);
    client.send({ t: "snap", layer, items });
  }

  private flush(client: ClientState, sub: Subscription) {
    for (const layer of sub.layers) {
      const sent = client.sent.get(layer);
      if (!sent) {
        this.snap(client, sub, layer);
        continue;
      }
      const up: TrackedObject[] = [];
      const seen = new Set<string>();
      for (const item of this.visible(sub, layer)) {
        seen.add(item.id);
        const prev = sent.get(item.id);
        if (!prev || this.changed(prev, item)) {
          up.push(item);
          sent.set(item.id, this.sentInfo(item));
        }
      }
      const rm: string[] = [];
      for (const id of sent.keys()) {
        if (!seen.has(id)) {
          rm.push(id);
          sent.delete(id);
        }
      }
      if (up.length || rm.length) client.send({ t: "delta", layer, up, rm });
    }
  }

  private changed(prev: SentInfo, item: TrackedObject) {
    if (item.updatedAt === prev.updatedAt) return false;
    const keyframeMs = this.keyframeMs[item.layer] ?? this.defaultKeyframeMs;
    if (item.updatedAt - prev.updatedAt >= keyframeMs) return true;
    if (item.heading !== undefined && prev.heading !== undefined) {
      if (headingDelta(item.heading, prev.heading) > HEADING_THRESHOLD_DEG) return true;
    }
    if (item.speed !== undefined && prev.speed) {
      if (Math.abs(item.speed - prev.speed) / prev.speed > SPEED_THRESHOLD) return true;
    }
    return false;
  }

  private sentInfo(item: TrackedObject): SentInfo {
    return { updatedAt: item.updatedAt, heading: item.heading, speed: item.speed };
  }
}
