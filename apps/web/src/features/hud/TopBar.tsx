import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./Icon";
import { useViewStore } from "../../store/view";
import { feedLabel } from "./feedLabel";
import { Kbd } from "@spyapp/ui";

function useUtcClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now.toISOString().slice(11, 19);
}

export function TopBar({ onCommand }: { onCommand: () => void }) {
  const { t, i18n } = useTranslation();
  const utc = useUtcClock();
  const feed = useViewStore((state) => state.feed);
  const active = useViewStore((state) => state.activeLayers.aircraft);
  const nextLang = i18n.language.startsWith("ru") ? "en" : "ru";
  return (
    <header className="top-bar">
      <div className="brand">
        <span className="brand-mark">
          <Icon name="globe" />
        </span>
        <span>
          SPYAPP<span className="brand-caption">{t("top.caption")}</span>
        </span>
      </div>
      <button
        type="button"
        className="command-trigger"
        onClick={onCommand}
        aria-label={t("command.open")}
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K"
      >
        <Icon name="terminal" />
        <span>{t("command.open")}</span>
        <Kbd>Ctrl K</Kbd>
      </button>
      <div className="top-meta">
        <span
          className={`api-status ${feed.mode === "stream" && feed.connection === "live" && !feed.issue ? "connected" : ""}`}
          title={t(`feed.connection.${feed.connection}`)}
        >
          <span className="status-dot" />
          <span className="feed-summary">{t(feedLabel(feed, active))}</span>
        </span>
        <time className="utc-clock hud-num">
          {utc}
          <span>UTC</span>
        </time>
        <button
          type="button"
          className="language-button hud-num"
          onClick={() => void i18n.changeLanguage(nextLang)}
          aria-label={t("top.switchLang")}
        >
          {nextLang.toUpperCase()}
        </button>
      </div>
    </header>
  );
}
