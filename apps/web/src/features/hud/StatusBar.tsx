import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import { useViewStore } from "../../store/view";

function formatCoord(value: number, pos: string, neg: string) {
  return `${Math.abs(value).toFixed(4)}° ${value >= 0 ? pos : neg}`;
}

/** Нижняя строка: координаты под курсором, высота камеры, атрибуция источников. */
export function StatusBar({ creditRef }: { creditRef: Ref<HTMLDivElement> }) {
  const { t, i18n } = useTranslation();
  const cursor = useViewStore((s) => s.cursor);
  const height = useViewStore((s) => s.cameraHeight);
  const fmt = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 });
  const altitude =
    height >= 10_000
      ? `${fmt.format(height / 1000)} ${t("status.km")}`
      : `${fmt.format(height)} ${t("status.m")}`;

  return (
    <footer className="pointer-events-auto flex h-8 items-center gap-6 border-t border-line bg-panel px-4 text-[12px] backdrop-blur-[var(--panel-blur)]">
      <span className="flex gap-2">
        <span className="hud-label leading-[inherit]">{t("status.cursor")}</span>
        <span className="hud-num w-52 text-text">
          {cursor
            ? `${formatCoord(cursor.lat, "N", "S")}  ${formatCoord(cursor.lon, "E", "W")}`
            : "—"}
        </span>
      </span>
      <span className="flex gap-2">
        <span className="hud-label leading-[inherit]">{t("status.altitude")}</span>
        <span className="hud-num text-text">{height ? altitude : "—"}</span>
      </span>
      <div ref={creditRef} className="spy-credits ml-auto min-w-0 truncate" />
    </footer>
  );
}
