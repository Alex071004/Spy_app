import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./Icon";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

function useUtcClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now.toISOString().slice(11, 19);
}

function useApiLink() {
  const [up, setUp] = useState<boolean | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const check = async () => {
      try {
        const response = await fetch(`${API_URL}/health`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
        });
        if (!controller.signal.aborted) setUp(response.ok);
      } catch {
        if (!controller.signal.aborted) setUp(false);
      }
    };
    void check();
    const id = setInterval(() => void check(), 10_000);
    return () => {
      controller.abort();
      clearInterval(id);
    };
  }, []);
  return up;
}

export function TopBar() {
  const { t, i18n } = useTranslation();
  const utc = useUtcClock();
  const linkUp = useApiLink();
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
      <div className="workspace-title">
        <span className="status-dot accent" />
        {t("top.workspace")}
        <span className="workspace-index hud-num">01</span>
      </div>
      <div className="top-meta">
        <span className={`api-status ${linkUp ? "connected" : ""}`}>
          <span className="status-dot" />
          {t(linkUp === null ? "top.checking" : linkUp ? "top.linkUp" : "top.linkDown")}
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
