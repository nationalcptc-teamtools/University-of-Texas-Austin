import { createRequire } from "node:module";
import { dirname } from "node:path";

// Resolved through the package name so it still works once the caller is bundled.
export const PACKAGE_DIR = dirname(
  createRequire(import.meta.url).resolve("@burokrat/typst/package.json"),
);
