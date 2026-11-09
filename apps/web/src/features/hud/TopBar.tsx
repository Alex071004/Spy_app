import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Kbd } from "@spyapp/ui";

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
    let alive = true;
    const check = () =>
      fetch(`${API_URL}/health`)
        .then((r) => alive && setUp(r.ok))
        .catch(() => alive && setUp(false));
    void check();
    const id = setInterval(check, 10_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return up;
}

export function TopBar() {
  const { t, i18n } = useTranslation();
  const utc = useUtcClock();
  const linkUp = useApiLink();
  const nextLang = i18n.language === "ru" ? "en" : "ru";

  return (
    <header className="pointer-events-auto flex h-11 items-center gap-4 border-b border-line bg-panel px-4 backdrop-blur-[var(--panel-blur)]">
      <div className="flex items-center gap-2.5">
        <svg viewBox="0 0 32 32" className="size-5 text-accent" aria-hidden="true">
          <circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="16" cy="16" r="2.5" fill="currentColor" />
          <path d="M16 3v5M16 24v5M3 16h5M24 16h5" stroke="currentColor" strokeWidth="2" />
        </svg>
        <span className="text-[13px] font-medium tracking-[0.28em] text-text">SPYAPP</span>
      </div>

      {/* Командная строка появится в фазе 1 (docs/09-features.md) */}
      <div className="mx-auto flex h-7 w-full max-w-md items-center justify-between rounded-sm border border-line bg-raised/70 px-3 text-[12px] text-muted">
        <span>{t("top.command")}</span>
        <span className="flex gap-1">
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </span>
      </div>

      <div className="flex items-center gap-4 text-[12px]">
        <span className="flex items-center gap-1.5 text-secondary">
          <span
            className={`size-1.5 rounded-full ${linkUp ? "bg-ok" : linkUp === false ? "bg-alert" : "bg-muted"}`}
          />
          {linkUp === false ? t("top.linkDown") : t("top.linkUp")}
        </span>
        <span className="hud-num text-text">
          {utc} <span className="text-muted">UTC</span>
        </span>
        <button
          type="button"
          onClick={() => void i18n.changeLanguage(nextLang)}
          title={t("top.switchLang")}
          className="hud-num rounded-sm border border-line px-1.5 py-0.5 text-[11px] uppercase text-secondary transition-colors duration-[var(--dur-fast)] hover:border-line-strong hover:text-text"
        >
          {nextLang}
        </button>
      </div>
    </header>
  );
}
