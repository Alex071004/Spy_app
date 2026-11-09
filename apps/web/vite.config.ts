import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Пути абсолютные: dev-сервер может быть запущен не из apps/web
const fromHere = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const cesiumBaseUrl = "cesium";

/**
 * Cesium грузит воркеры и ассеты в рантайме. Копируем их в public/cesium
 * (в .gitignore) один раз на версию пакета, дальше Vite раздаёт их как статику.
 */
function cesiumAssets(): Plugin {
  const source = fromHere("node_modules/cesium/Build/Cesium");
  const target = fromHere(`public/${cesiumBaseUrl}`);
  const stamp = `${target}/.version`;
  return {
    name: "spyapp:cesium-assets",
    buildStart() {
      const { version } = JSON.parse(
        readFileSync(fromHere("node_modules/cesium/package.json"), "utf8"),
      ) as { version: string };
      if (existsSync(stamp) && readFileSync(stamp, "utf8") === version) return;
      rmSync(target, { recursive: true, force: true });
      for (const dir of ["Workers", "ThirdParty", "Assets", "Widgets"]) {
        cpSync(`${source}/${dir}`, `${target}/${dir}`, { recursive: true });
      }
      writeFileSync(stamp, version);
    },
  };
}

export default defineConfig({
  envDir: fromHere("../.."),
  define: {
    CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}`),
  },
  plugins: [cesiumAssets(), react(), tailwindcss()],
  server: { port: 5173 },
});
