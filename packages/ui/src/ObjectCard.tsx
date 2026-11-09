import { useId, type ReactNode } from "react";
import { IconButton } from "./IconButton";

interface ObjectCardProps {
  title: ReactNode;
  subtitle: ReactNode;
  badge: ReactNode;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}

/** Досье поверх глобуса: заголовок, статус, поля и происхождение данных. */
export function ObjectCard({
  title,
  subtitle,
  badge,
  closeLabel,
  onClose,
  children,
  footer,
}: ObjectCardProps) {
  const headingId = useId();
  return (
    <section className="hud-panel hud-object-card" aria-labelledby={headingId}>
      <header className="object-card-header">
        <div>
          <p className="hud-label">{subtitle}</p>
          <h2 id={headingId} className="hud-num">
            {title}
          </h2>
        </div>
        <IconButton label={closeLabel} onClick={onClose}>
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="m6 6 12 12M6 18 18 6" />
          </svg>
        </IconButton>
      </header>
      <div className="object-card-body">
        <div className="object-card-badge">{badge}</div>
        {children}
      </div>
      <footer className="object-card-footer">{footer}</footer>
    </section>
  );
}
