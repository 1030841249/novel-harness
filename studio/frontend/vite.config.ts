import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // CodeMirror 仅在编辑器路由按需加载，单独使用较高的分包告警阈值。
    chunkSizeWarningLimit: 850,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8765",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    exclude: ["tests/**", "node_modules/**", "dist/**"],
  },
});
