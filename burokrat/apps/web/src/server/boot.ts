import { checkTypst, TypstPool } from "@burokrat/typst";
import { definePlugin } from "nitro";
import { collectOrphanedBlobs } from "./assets.server.ts";
import { migrateDatabase } from "./db.server.ts";
import { closeSync } from "./sync/instance.server.ts";

const GC_INTERVAL_MS = 60 * 60 * 1000;

function collectAssets() {
  try {
    collectOrphanedBlobs();
  } catch (error) {
    console.error("Asset cleanup failed", error);
  }
}

/** A missing font only shows as a warning, so the server refuses to run without them. */
async function checkFonts() {
  const probe = new TypstPool({ size: 1 });
  try {
    await checkTypst(probe);
  } catch (error) {
    console.error(error);
    process.exit(1);
  } finally {
    await probe.close();
  }
}

export default definePlugin((nitroApp) => {
  try {
    process.loadEnvFile();
  } catch {}
  migrateDatabase();
  collectAssets();
  const gc = setInterval(collectAssets, GC_INTERVAL_MS).unref();
  nitroApp.hooks.hook("close", () => {
    clearInterval(gc);
    closeSync();
  });
  void checkFonts();
});
