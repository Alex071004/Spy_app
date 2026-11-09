import { useTranslation } from "react-i18next";
import { useViewStore } from "../../store/view";
import { feedLabel } from "./feedLabel";

export function FeedNotice({ onFocus }: { onFocus: () => void }) {
  const { t } = useTranslation();
  const feed = useViewStore((state) => state.feed);
  const active = useViewStore((state) => state.activeLayers.aircraft);
  const warning = feed.simulated || feed.connection !== "live" || feed.issue !== null;
  return (
    <div className={`feed-notice ${warning ? "feed-warning" : ""}`} role="status">
      <span className="status-dot" />
      <span>{t(feedLabel(feed, active))}</span>
      {active && feed.mode === "demo" && feed.connection !== "incompatible" && (
        <button type="button" onClick={onFocus}>
          {t("feed.focus")}
        </button>
      )}
    </div>
  );
}
