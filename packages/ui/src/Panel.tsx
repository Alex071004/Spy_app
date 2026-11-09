import type { ReactNode } from "react";

interface PanelProps {
  title?: ReactNode;
  /** Справа от заголовка: счётчик, кнопка свернуть */
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Объёмная компактная поверхность поверх глобуса. */
export function Panel({ title, aside, className = "", children }: PanelProps) {
  return (
    <section className={`hud-panel ${className}`}>
      {title !== undefined && (
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="hud-label">{title}</h2>
          {aside}
        </header>
      )}
      <div className="p-3">{children}</div>
    </section>
  );
}
