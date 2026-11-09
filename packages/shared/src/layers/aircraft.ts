import { z } from "zod";

/**
 * Поля `props` объекта слоя `aircraft`. Описание: docs/api/README.md.
 * Все поля, кроме onGround, необязательны: источники заполняют их по-разному.
 */
export const AircraftPropsSchema = z.object({
  /** Позывной рейса без пробелов: "AFL1234" */
  callsign: z.string().optional(),
  /** ICAO-код типа: "B738", "A321" */
  type: z.string().optional(),
  registration: z.string().optional(),
  /** Код транспондера, 4 восьмеричные цифры. 7500/7600/7700 означают особые ситуации */
  squawk: z
    .string()
    .regex(/^[0-7]{4}$/)
    .optional(),
  onGround: z.boolean(),
  /** Категория ADS-B: A1 лёгкий … A5 тяжёлый, B — вертолёты/планеры, C — наземные */
  category: z.string().optional(),
  /** Вертикальная скорость, м/с, плюс = набор */
  verticalRate: z.number().optional(),
  /** Заявленная экипажем ситуация: "general", "lifeguard", "minfuel", "nordo", "unlawful", "downed" */
  emergency: z.string().optional(),
  military: z.boolean().optional(),
  /** Аэропорты вылета и назначения (IATA). Пока только в симуляторе */
  origin: z.string().optional(),
  destination: z.string().optional(),
});
export type AircraftProps = z.infer<typeof AircraftPropsSchema>;

/** Сквоки особых ситуаций: угон, потеря связи, бедствие */
export const EMERGENCY_SQUAWKS = ["7500", "7600", "7700"] as const;
