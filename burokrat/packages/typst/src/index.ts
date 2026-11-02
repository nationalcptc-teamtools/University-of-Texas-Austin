import { BLANK_FINDING } from "@burokrat/domain";
import type { Diagnostic } from "./compile.ts";
import { findingInput } from "./data.ts";
import type { TypstPool } from "./pool.ts";

export type { CompileJob, CompileOutcome, Diagnostic } from "./compile.ts";
export type { JobKind } from "./paths.ts";
export {
  findingInput,
  reportInput,
  type ProjectInfo,
  type TypstData,
  type TypstInput,
} from "./data.ts";
export { TypstPool } from "./pool.ts";

const describe = (diagnostics: Diagnostic[]) =>
  diagnostics.map(({ message }) => message).join("; ");

/** Compiles a blank finding. A warning there usually means a font is missing, so it throws. */
export async function checkTypst(pool: TypstPool) {
  const { data } = findingInput({ companyName: "Acme", teamName: "Team" }, BLANK_FINDING);
  const outcome = await pool.compile({
    kind: "finding",
    data,
    assets: {},
    creationTimestamp: 0,
  });
  if (!outcome.ok) throw new Error(`Typst self-check failed: ${describe(outcome.diagnostics)}`);
  if (outcome.warnings.length > 0) {
    throw new Error(`Typst self-check warned: ${describe(outcome.warnings)}`);
  }
}
