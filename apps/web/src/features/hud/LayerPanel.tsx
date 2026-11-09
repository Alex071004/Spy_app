import { useTranslation } from "react-i18next";
import type { LayerId } from "@spyapp/shared";
import { IconButton, LayerToggle, Panel } from "@spyapp/ui";
import { useViewStore } from "../../store/view";
import { Icon, type IconName } from "./Icon";
import { feedLabel } from "./feedLabel";

const LAYERS: { id: LayerId; icon: IconName; color: string }[] = [
  { id: "aircraft", icon: "aircraft", color: "text-aircraft" },
  { id: "vessels", icon: "vessels", color: "text-vessels" },
  { id: "satellites", icon: "satellites", color: "text-satellites" },
  { id: "events", icon: "events", color: "text-events" },
];

export function LayerPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const active = useViewStore((s) => s.activeLayers);
  const toggle = useViewStore((s) => s.toggleLayer);
  const feed = useViewStore((s) => s.feed);
  return (
    <Panel
      title={t("layers.title")}
      aside={
        <IconButton label={t("layers.hide")} onClick={onClose}>
          <Icon name="close" />
        </IconButton>
      }
    >
      <ul>
        {LAYERS.map(({ id, icon, color }) => (
          <li key={id}>
            <LayerToggle
              label={t(`layers.${id}`)}
              description={t(
                !active[id]
                  ? "layers.disabled"
                  : id === "aircraft"
                    ? feedLabel(feed, true)
                    : "layers.waiting",
              )}
              icon={<Icon name={icon} />}
              active={active[id]}
              onToggle={() => toggle(id)}
              className={color}
            />
          </li>
        ))}
      </ul>
      <div className="layer-note">
        <span className="status-dot" />
        {t(`feed.connection.${feed.connection}`)}
      </div>
    </Panel>
  );
}
