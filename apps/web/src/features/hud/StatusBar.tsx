import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import { useViewStore } from "../../store/view";

function formatCoord(value: number, pos: string, neg: string) {
  return `${Math.abs(value).toFixed(4)}° ${value >= 0 ? pos : neg}`;
}

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
    <footer className="status-bar">
      <span className="cursor-readout">
        <span className="status-dot accent" />
        <span className="hud-num">
          {cursor
            ? `${formatCoord(cursor.lat, "N", "S")}  ${formatCoord(cursor.lon, "E", "W")}`
            : t("status.hover")}
        </span>
      </span>
      <span className="altitude-readout">
        <span className="hud-label">{t("status.altitude")}</span>
        <span className="hud-num">{height ? altitude : "—"}</span>
      </span>
      <div ref={creditRef} className="spy-credits" />
    </footer>
  );
}
