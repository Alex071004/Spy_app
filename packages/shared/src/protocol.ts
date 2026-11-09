import { z } from "zod";
import { BBoxSchema, LayerIdSchema, TrackedObjectSchema } from "./model";

// Протокол WebSocket /ws (ADR-0003). Описание: docs/api/README.md

/** Повышается при ломающем изменении сообщений */
export const PROTOCOL_VERSION = 1;

const zoom = z.number().int().min(0).max(22);

export const ClientMessageSchema = z.discriminatedUnion("t", [
  /** Подписка на слои в видимой области. Повторный sub заменяет предыдущий */
  z.object({ t: z.literal("sub"), layers: z.array(LayerIdSchema), bbox: BBoxSchema, z: zoom }),
  /** Камера сдвинулась: та же подписка, новая область */
  z.object({ t: z.literal("view"), bbox: BBoxSchema, z: zoom }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export const ServerMessageSchema = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("hello"),
    server: z.string(),
    protocol: z.number().int(),
    time: z.number().int(),
  }),
  /** Полное состояние слоя в области подписки, приходит после sub и при смене слоёв */
  z.object({ t: z.literal("snap"), layer: LayerIdSchema, items: z.array(TrackedObjectSchema) }),
  /** Изменения с прошлого сообщения: up = добавить или обновить, rm = id на удаление */
  z.object({
    t: z.literal("delta"),
    layer: LayerIdSchema,
    up: z.array(TrackedObjectSchema),
    rm: z.array(z.string()),
  }),
  z.object({ t: z.literal("error"), code: z.string(), message: z.string() }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
