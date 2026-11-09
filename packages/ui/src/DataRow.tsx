import type { ReactNode } from "react";

interface DataRowProps {
  label: ReactNode;
  value: ReactNode;
  /** Единица измерения, рисуется приглушённо после значения */
  unit?: string;
}

/** Строка «подпись — моноширинное значение». */
export function DataRow({ label, value, unit }: DataRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-[12px]">
      <span className="text-secondary">{label}</span>
      <span className="hud-num text-text">
        {value}
        {unit !== undefined && <span className="ml-1 text-muted">{unit}</span>}
      </span>
    </div>
  );
}
