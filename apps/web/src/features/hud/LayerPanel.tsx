import { useTranslation } from "react-i18next";
import type { LayerId } from "@spyapp/shared";
import { Panel } from "@spyapp/ui";
import { useViewStore } from "../../store/view";

const LAYERS: { id: LayerId; color: string }[] = [
  { id: "aircraft", color: "bg-aircraft" },
  { id: "vessels", color: "bg-vessels" },
  { id: "satellites", color: "bg-satellites" },
  { id: "events", color: "bg-events" },
];

export function LayerPanel() {
  const { t } = useTranslation();
  const active = useViewStore((s) => s.activeLayers);
  const toggle = useViewStore((s) => s.toggleLayer);

  return (
    <Panel title={t("layers.title")} className="pointer-events-auto w-56">
      <ul className="-mx-1">
        {LAYERS.map(({ id, color }) => (
          <li key={id}>
            <button
              type="button"
              aria-pressed={active[id]}
              onClick={() => toggle(id)}
              className="group flex w-full items-center gap-2.5 rounded-sm px-1 py-1.5 text-left text-[13px] transition-colors duration-[var(--dur-fast)] hover:bg-hover"
            >
              <span
                className={`size-2 rounded-full ${color} transition-opacity ${active[id] ? "" : "opacity-25"}`}
              />
              <span className={active[id] ? "text-text" : "text-muted"}>{t(`layers.${id}`)}</span>
              {/* Счётчики объектов появятся вместе с live-данными в фазе 1 */}
              <span className="hud-num ml-auto text-[12px] text-muted">—</span>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
