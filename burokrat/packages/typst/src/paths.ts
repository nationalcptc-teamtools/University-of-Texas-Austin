/** Entry templates, by their path inside the Typst workspace. */
export const MAIN = {
  finding: "/typ/finding-main.typ",
  report: "/typ/report-main.typ",
} as const;

/** Compiles one text field on its own, from a `FieldCheck`. */
export const FIELD_MAIN = "/typ/field-main.typ";

export type JobKind = keyof typeof MAIN;
