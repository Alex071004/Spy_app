import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AircraftPropsSchema, EMERGENCY_SQUAWKS } from "@spyapp/shared";
import { DataRow, ObjectCard } from "@spyapp/ui";
import { useViewStore } from "../../store/view";

// Общие фикстуры не заполняют onGround; остальные поля сохраняют валидацию контракта.
const DisplayPropsSchema = AircraftPropsSchema.partial();

export function AircraftDossier({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const object = useViewStore((state) => state.selectedObject);
  const feed = useViewStore((state) => state.feed);
  const cardRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (object?.id) cardRef.current?.focus({ preventScroll: true });
  }, [object?.id]);
  if (!object) return null;
  const parsed = DisplayPropsSchema.safeParse(object.props);
  const props = parsed.success ? parsed.data : {};
  const emergency = EMERGENCY_SQUAWKS.some((code) => code === props.squawk);
  const simulated = object.source === "simulator" || object.source === "fixture";
  const stale = feed.mode === "stream" && feed.connection !== "live";
  const number = (value: number | undefined, digits = 0) =>
    value === undefined
      ? "—"
      : new Intl.NumberFormat(i18n.language, { maximumFractionDigits: digits }).format(value);
  const updated = new Intl.DateTimeFormat(i18n.language, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }).format(object.updatedAt);
  return (
    <aside ref={cardRef} tabIndex={-1} className="dossier" aria-label={t("object.title")}>
      <ObjectCard
        title={props.callsign || props.registration || t("object.unknown")}
        subtitle={t("object.title")}
        closeLabel={t("object.close")}
        onClose={onClose}
        badge={
          <span className="object-status" data-alert={emergency || stale}>
            <span className="status-dot" />
            {t(
              stale
                ? "object.stale"
                : emergency
                  ? "object.emergency"
                  : props.onGround
                    ? "object.onGround"
                    : "object.observed",
            )}
          </span>
        }
        footer={
          <>
            <p>
              {t("object.updated")} <span className="hud-num">{updated} UTC</span>
            </p>
            <p>
              {t("object.source")} {simulated ? t("object.simulated") : object.source}
            </p>
            {object.source === "adsb-lol" && (
              <a href="https://www.adsb.lol/" target="_blank" rel="noreferrer">
                {t("object.attribution")}
              </a>
            )}
          </>
        }
      >
        <div className="object-type">
          <span className="hud-num">{props.type || "—"}</span>
          <span>{props.registration || "—"}</span>
        </div>
        <div className="object-metrics">
          <div>
            <span className="hud-label">{t("object.altitude")}</span>
            <strong className="hud-num">
              {number(object.position.alt)}
              <small>{t("status.m")}</small>
            </strong>
          </div>
          <div>
            <span className="hud-label">{t("object.speed")}</span>
            <strong className="hud-num">
              {number(object.speed === undefined ? undefined : object.speed * 3.6)}
              <small>{t("object.kmh")}</small>
            </strong>
          </div>
        </div>
        <DataRow label={t("object.heading")} value={number(object.heading)} unit="°" />
        <DataRow
          label={t("object.squawk")}
          value={<span className={emergency ? "text-alert" : ""}>{props.squawk || "—"}</span>}
        />
        {props.verticalRate !== undefined && (
          <DataRow
            label={t("object.verticalRate")}
            value={number(props.verticalRate, 1)}
            unit={t("object.ms")}
          />
        )}
        {(props.origin || props.destination) && (
          <DataRow
            label={t("object.route")}
            value={`${props.origin || "—"} → ${props.destination || "—"}`}
          />
        )}
        <div className="object-coordinates">
          <span className="hud-label">{t("object.measuredPosition")}</span>
          <span className="hud-num">
            {object.position.lat.toFixed(4)}°, {object.position.lon.toFixed(4)}°
          </span>
        </div>
      </ObjectCard>
    </aside>
  );
}
