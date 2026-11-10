import type { SVGProps } from "react";

const paths = {
  target: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  globe: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z",
  aircraft: "m12 3 2 7 7 4v2l-7-2v5l2 2H8l2-2v-5l-7 2v-2l7-4 2-7Z",
  vessels: "m3 13 9-3 9 3-3 6H6l-3-6Zm4-1V7h10v5M10 7V4h4v3M3 21l3-1 3 1 3-1 3 1 3-1 3 1",
  satellites:
    "m9 9 6 6m-7-3 4-4 4 4-4 4-4-4Zm-5-4 4-4 3 3-4 4-3-3Zm11 11 4-4 3 3-4 4-3-3Zm0-17a7 7 0 0 1 7 7m-7-3a3 3 0 0 1 3 3",
  events: "m13 3-9 11h7l-1 7 10-12h-7l1-6Z",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  home: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 12h8m-4-4v8",
  sun: "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1",
  layers: "m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5",
  close: "m6 6 12 12M6 18 18 6",
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
