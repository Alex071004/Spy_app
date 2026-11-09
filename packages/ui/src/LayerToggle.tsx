import type { ReactNode } from "react";

interface LayerToggleProps {
  label: string;
  description: string;
  icon: ReactNode;
  active: boolean;
  className?: string;
  onToggle: () => void;
}

export function LayerToggle({
  label,
  description,
  icon,
  active,
  className = "",
  onToggle,
}: LayerToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={onToggle}
      className={`hud-layer ${className}`}
    >
      <span className="hud-layer-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="hud-layer-copy">
        <span className="hud-layer-label">{label}</span>
        <span className="hud-layer-description">{description}</span>
      </span>
      <span className="hud-switch" aria-hidden="true">
        <span />
      </span>
    </button>
  );
}
