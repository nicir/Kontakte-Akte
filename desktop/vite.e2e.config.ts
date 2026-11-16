/**
 * TEST-ONLY Vite config for browser end-to-end tests (Playwright).
 * Replaces the Tauri bridge with e2e/shim/* and proxies /__backend to the
 * locally running backend, injecting the bridge token server-side.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const tokenFile = process.env.KA_E2E_TOKEN_FILE ?? "";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@tauri-apps/api/core", replacement: path.resolve(import.meta.dirname, "e2e/shim/tauri-core.ts") },
      { find: "@tauri-apps/api/event", replacement: path.resolve(import.meta.dirname, "e2e/shim/tauri-event.ts") },
      { find: "@", replacement: path.resolve(import.meta.dirname, "./src") },
    ],
  },
  server: {
    port: 1430,
    strictPort: true,
    host: "127.0.0.1",
    proxy: {
      "/__backend": {
        target: "http://127.0.0.1:47811",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/__backend/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (req) => {
            req.removeHeader("origin");
            req.removeHeader("referer");
            req.setHeader("X-KA-Bridge", readFileSync(tokenFile, "utf8").trim());
          });
        },
      },
    },
  },
});
