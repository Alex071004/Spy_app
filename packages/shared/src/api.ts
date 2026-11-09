import { z } from "zod";

// REST-ответы API. Описание: docs/api/README.md

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  /** Аптайм процесса, секунды */
  uptime: z.number().int(),
  protocol: z.number().int(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
