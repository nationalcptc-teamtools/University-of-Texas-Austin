import { z } from "zod";
import { findingContentSchema } from "./content.ts";

/** Kept out of the package index: `import.meta.glob` needs Vite, and the Typst worker loads the index in plain Node. */
export const FINDING_TEMPLATES = z
  .array(findingContentSchema)
  .parse(
    Object.values(
      import.meta.glob("../data/finding_templates/*.json", { import: "default", eager: true }),
    ),
  );
