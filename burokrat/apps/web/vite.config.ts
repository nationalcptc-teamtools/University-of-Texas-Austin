import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, transformWithOxc, type Plugin } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

const loroWeb = fileURLToPath(new URL("./src/client/loro-web.ts", import.meta.url));

/**
 * Sends every browser import of `loro-crdt` to one wasm build, including the imports inside the
 * Loro libraries. `resolve.alias` is ignored by `vp build`, so this is a plugin.
 */
const loroClientAlias = (): Plugin => ({
  name: "loro-client-alias",
  enforce: "pre",
  applyToEnvironment: (environment) => environment.name === "client",
  resolveId(id, importer) {
    if (id === "loro-crdt" && importer !== loroWeb) return loroWeb;
  },
});

const serviceWorkerSource = fileURLToPath(new URL("./src/service-worker.ts", import.meta.url));
const publicFiles = readdirSync(new URL("./public", import.meta.url)).map((name) => `/${name}`);

/** Builds `/sw.js` and gives it the client build's files to cache. */
const serviceWorker = (): Plugin => ({
  name: "service-worker",
  apply: "build",
  applyToEnvironment: (environment) => environment.name === "client",
  async generateBundle(_, bundle) {
    const files = [
      ...publicFiles,
      ...Object.keys(bundle)
        .filter((name) => !name.endsWith(".map"))
        .map((name) => `/${name}`),
    ];
    const version = createHash("sha256").update(files.join()).digest("hex").slice(0, 12);
    const { code } = await transformWithOxc(
      readFileSync(serviceWorkerSource, "utf8"),
      serviceWorkerSource,
      { define: { __BUILD__: JSON.stringify({ version, files }) } },
    );
    this.emitFile({ type: "asset", fileName: "sw.js", source: code });
  },
});

export default defineConfig({
  server: { port: 3000 },
  environments: {
    client: {
      optimizeDeps: {
        // Loaded lazily or in the preview worker, which Vite would otherwise find late and reload for.
        include: [
          "@myriaddreamin/typst.ts/renderer",
          "@myriaddreamin/typst.ts/compiler",
          "@myriaddreamin/typst.ts/options.init",
        ],
        exclude: [
          "loro-crdt",
          "loro-adaptors",
          "loro-websocket",
          "loro-protocol",
          "loro-codemirror",
          "loro-mirror",
          "loro-mirror-react",
        ],
      },
      build: {
        rolldownOptions: {
          // The editor's vendor code, cached apart from the app code that changes with each deploy.
          output: {
            codeSplitting: {
              groups: [
                {
                  name: "codemirror",
                  test: /node_modules[\\/](@codemirror|@lezer|codemirror-lang-typst|style-mod|w3c-keyname|crelt)[\\/]/,
                },
              ],
            },
          },
        },
      },
    },
  },
  plugins: [
    tanstackStart(),
    // Vitest runs Vite without an HTTP server, which Nitro's dev server needs.
    !process.env.VITEST &&
      nitro({
        features: { websocket: true },
        plugins: ["./src/server/boot.ts"],
        routes: { "/sync": "./src/server/sync/route.ts" },
        // The Typst compiler's wasm is 28 MB, and 7 MB as brotli.
        // compressPublicAssets: true,
        // Its Node build loads the wasm and glue files next to it, so it can't be bundled.
        traceDeps: ["loro-crdt*"],
        // Kumo and TanStack mark modules "use client", which means nothing without server components.
        rolldownConfig: { checks: { moduleLevelDirective: false } },
      }),
    viteReact(),
    tailwindcss(),
    loroClientAlias(),
    serviceWorker(),
  ],
  test: {
    projects: [
      { extends: true, test: { name: "unit", include: ["src/**/*.test.ts"] } },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.tsx"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({ launchOptions: { channel: "chrome" } }),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
