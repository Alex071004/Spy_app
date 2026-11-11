import type { FastifyBaseLogger } from "fastify";
import type { BBox, LayerId, TrackedObject } from "@spyapp/shared";

export interface ConnectorContext {
  /** Положить свежие объекты в состояние мира */
  upsert(items: TrackedObject[]): void;
  /** Области, которые клиенты сейчас смотрят на этом слое вблизи: их стоит обновлять чаще */
  views(): BBox[];
  log: FastifyBaseLogger;
}

/** Источник данных одного слоя (docs/04-architecture.md, «Коннекторы») */
export interface Connector {
  /** "adsb-lol", "simulator-aircraft" */
  id: string;
  layer: LayerId;
  /** Сколько держать объект этого источника без обновлений, если дольше TTL слоя (редкий опрос) */
  ttlMs?: number;
  start(ctx: ConnectorContext): void | Promise<void>;
  stop(): void | Promise<void>;
}
