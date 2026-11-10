import { useTranslation } from "react-i18next";
import { IconButton } from "@spyapp/ui";
import { Icon } from "./Icon";

export type CameraAction = "zoomIn" | "zoomOut" | "reset";

interface SceneControlsProps {
  onSelect: () => void;
  onCamera: (action: CameraAction) => void;
  lighting: boolean;
  onLighting: () => void;
  layersOpen: boolean;
  onLayers: () => void;
}

export function SceneControls({
  onSelect,
  onCamera,
  lighting,
  onLighting,
  layersOpen,
  onLayers,
}: SceneControlsProps) {
  const { t } = useTranslation();
  return (
    <nav className="scene-controls hud-panel" aria-label={t("scene.controls")}>
      <IconButton label={t("object.selectNearest")} onClick={onSelect}>
        <Icon name="target" />
      </IconButton>
      <IconButton label={t("scene.layers")} aria-pressed={layersOpen} onClick={onLayers}>
        <Icon name="layers" />
      </IconButton>
      <span className="control-divider" />
      <IconButton label={t("scene.zoomIn")} onClick={() => onCamera("zoomIn")}>
        <Icon name="plus" />
      </IconButton>
      <IconButton label={t("scene.zoomOut")} onClick={() => onCamera("zoomOut")}>
        <Icon name="minus" />
      </IconButton>
      <IconButton label={t("scene.reset")} onClick={() => onCamera("reset")}>
        <Icon name="home" />
      </IconButton>
      <span className="control-divider" />
      <IconButton label={t("scene.lighting")} aria-pressed={lighting} onClick={onLighting}>
        <Icon name="sun" />
      </IconButton>
    </nav>
  );
}
