/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: { outDir: "dist", emptyOutDir: true, assetsDir: "assets" },
  test: {
    environment: "jsdom", globals: true, include: ["src/**/*.test.{ts,tsx}"], setupFiles: [],
    // The on-disk module cache keeps a stale transform of import.meta.glob in ext/load.ts, so a new
    // panel or extension folder is missed until the cache is cleared.
    fsModuleCache: false,
  },
});
