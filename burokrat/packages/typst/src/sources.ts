/** What the preview compiler loads: templates and fonts, without the data shaping. */
export { compileChecked, type Compilers, type FieldCheck } from "./fields.ts";
export { FIELD_MAIN, MAIN } from "./paths.ts";

/** Template sources keyed by their path in the Typst workspace, such as `/typ/finding-main.typ`. */
export const TEMPLATES: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("../typ/*.typ", { query: "?raw", import: "default", eager: true }),
  ).map(([path, source]) => [path.replace("../typ/", "/typ/"), source]),
);

export const FONT_URLS: string[] = Object.values(
  import.meta.glob<string>("../fonts/*.{otf,ttf}", {
    query: "?url",
    import: "default",
    eager: true,
  }),
);
