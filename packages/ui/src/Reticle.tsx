import type { Ref } from "react";

export function Reticle({ ref }: { ref: Ref<HTMLDivElement> }) {
  return <div ref={ref} className="hud-reticle" hidden aria-hidden="true" />;
}
