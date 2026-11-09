import type { ReactNode } from "react";

interface PanelProps {
  title?: ReactNode;
  /** Справа от заголовка: счётчик, кнопка свернуть */
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Полупрозрачная панель поверх глобуса с акцентными уголками. */
export function Panel({ title, aside, className = "", children }: PanelProps) {
  return (
    <section
      className={`hud-corners rounded-sm border border-line bg-panel backdrop-blur-[var(--panel-blur)] ${className}`}
    >
      {title !== undefined && (
        <header className="flex items-center justify-between border-b border-line px-3 py-2">
          <h2 className="hud-label">{title}</h2>
          {aside}
        </header>
      )}
      <div className="px-3 py-2">{children}</div>
    </section>
  );
}
