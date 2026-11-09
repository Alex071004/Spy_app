import { defineConfig } from "vitest/config";

// Тестам транспорта и геометрии не нужны WebGL, копирование ассетов и плагины UI.
export default defineConfig({ test: { include: ["src/**/*.test.ts"] } });
