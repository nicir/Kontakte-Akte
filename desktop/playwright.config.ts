import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Browser end-to-end tests: real backend (native Python, SQLCipher) + real UI,
// with the Tauri bridge replaced by e2e/shim (see vite.e2e.config.ts).
const dataDir = process.env.KA_E2E_DIR ?? path.join(os.tmpdir(), "kontakte-akte-e2e");
const tokenFile = path.join(dataDir, "config", "bridge.token");
const python = path.resolve(import.meta.dirname, "..", ".venv", "bin", "python");
const backendDir = path.resolve(import.meta.dirname, "..", "backend");

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:1430",
    viewport: { width: 1360, height: 900 },
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    screenshot: "only-on-failure",
  },
  projects: [
    // WebKit = the engine of WKWebView used by Tauri on macOS.
    { name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1360, height: 900 } } },
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 900 } } },
  ],
  webServer: [
    {
      command: `/bin/bash -c 'rm -rf "${dataDir}" && mkdir -p "${dataDir}/config" && openssl rand -hex 32 > "${tokenFile}" && cd "${backendDir}" && KA_DATA_ROOT="${dataDir}" exec "${python}" -m uvicorn app.main:create_app --factory --host 127.0.0.1 --port 47811 --no-access-log'`,
      url: "http://127.0.0.1:47811/api/health",
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `KA_E2E_TOKEN_FILE="${tokenFile}" npx vite --config vite.e2e.config.ts`,
      url: "http://127.0.0.1:1430",
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
