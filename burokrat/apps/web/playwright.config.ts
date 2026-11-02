import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";
import { PASSCODE } from "./e2e/env.ts";

const PORT = 3200;

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  timeout: 60_000,
  use: { baseURL: `http://localhost:${PORT}`, channel: "chrome" },
  webServer: {
    command: "vp build && node .output/server/index.mjs",
    url: `http://localhost:${PORT}/login`,
    timeout: 180_000,
    env: {
      PORT: String(PORT),
      DATA_DIR: mkdtempSync(join(tmpdir(), "burokrat-e2e-")),
      BUROKRAT_PASSCODE: PASSCODE,
      SESSION_SECRET: "e2e-secret-that-is-at-least-32-characters-long",
    },
  },
});
