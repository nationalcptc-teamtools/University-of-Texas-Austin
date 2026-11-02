import { FINDING_PROSE } from "@burokrat/domain";
import type { FieldData, FindingData, ImagesData, TypstData } from "./data.ts";
import type { JobKind } from "./paths.ts";

/** Everything a text field can read when it compiles on its own. */
export type FieldCheck = Pick<TypstData, "company" | "team" | "risk"> & {
  findings: Pick<FindingData, "category">[];
  field: FieldData;
  images: ImagesData;
};

/** How to compile a document, and one field on its own. Each resolves to Typst's error, if any. */
export type Compilers<R> = {
  document: (kind: JobKind, data: TypstData) => Promise<{ result: R; error?: string }>;
  field: (check: FieldCheck) => Promise<string | undefined>;
};

/** A field that fails to compile on its own: its name, and Typst's error. */
export type BrokenField = { label: string; error: string };

function textFields(data: TypstData) {
  const report = data.report;
  return [
    ...data.findings.flatMap((finding) =>
      FINDING_PROSE.map(({ key, label }) => ({
        label: finding.standalone ? label : `${finding.title || "Untitled"}: ${label}`,
        field: finding[key],
        images: finding.images,
      })),
    ),
    ...(report
      ? [
          { label: "Before the findings", field: report.prologue, images: report.images },
          { label: "After the findings", field: report.epilogue, images: report.images },
        ]
      : []),
  ];
}

/** Compiles each text field alone, and flags the ones that fail on a copy of `data`. */
async function checkFields<R>(data: TypstData, compile: Compilers<R>) {
  const checked = structuredClone(data);
  const { company, team, risk } = data;
  const findings = data.findings.map(({ category }) => ({ category }));
  const broken: BrokenField[] = [];
  for (const { label, field, images } of textFields(checked)) {
    if (!field.source.trim()) continue;
    const error = await compile.field({ company, team, risk, findings, field, images });
    if (error === undefined) continue;
    field.error = error;
    broken.push({ label, error });
  }
  return { checked, broken };
}

/**
 * Compiles `data`. If that fails, names the fields that fail alone. Unless `refuse` is set, it then
 * shows those fields as their error and source and compiles again, so one broken field does not
 * take the rest down.
 */
export async function compileChecked<R>(
  kind: JobKind,
  data: TypstData,
  compile: Compilers<R>,
  { refuse = false } = {},
) {
  const first = await compile.document(kind, data);
  if (first.error === undefined) return { ...first, broken: [] };
  const { checked, broken } = await checkFields(data, compile);
  if (refuse || broken.length === 0) return { ...first, broken };
  return { ...(await compile.document(kind, checked)), broken };
}
