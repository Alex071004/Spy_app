import type { ReactNode } from "react";

/** Подсказка клавиши: Ctrl+K, Esc. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="hud-num rounded-sm border border-line-strong bg-raised px-1.5 py-px text-[11px] text-secondary">
      {children}
    </kbd>
  );
}
