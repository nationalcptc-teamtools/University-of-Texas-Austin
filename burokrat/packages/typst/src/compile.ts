import { readdirSync, readFileSync } from "node:fs";
import {
  NodeCompiler,
  type NodeError,
  type NodeTypstDocument,
} from "@myriaddreamin/typst-ts-node-compiler";
import type { TypstData } from "./data.ts";
import { compileChecked, type BrokenField, type Compilers } from "./fields.ts";
import { FIELD_MAIN, MAIN, type JobKind } from "./paths.ts";

const PACKAGE_DIR = new URL("..", import.meta.url);
const TYP_DIR = new URL("typ/", PACKAGE_DIR);
const FONTS_DIR = new URL("fonts/", PACKAGE_DIR).pathname;

/** Virtual workspace root: every file is a shadow under it, so nothing on disk is reachable. */
const WORKSPACE = "/typst-ws";

export type CompileJob = {
  kind: JobKind;
  data: TypstData;
  assets: Record<string, Uint8Array>;
  /** Unix seconds. Fixing it makes the PDF reproducible. */
  creationTimestamp: number;
};

export type Diagnostic = { message: string; path: string };

export type CompileOutcome =
  | { ok: true; pdf: Uint8Array; warnings: Diagnostic[] }
  /** `broken` names the text fields that fail on their own, when that is why. */
  | { ok: false; diagnostics: Diagnostic[]; broken: BrokenField[] };

export function createCompiler() {
  const compiler = NodeCompiler.create({
    workspace: WORKSPACE,
    fontArgs: [{ fontPaths: [FONTS_DIR] }],
  });
  for (const file of readdirSync(TYP_DIR)) {
    compiler.addSource(`${WORKSPACE}/typ/${file}`, readFileSync(new URL(file, TYP_DIR), "utf8"));
  }
  return compiler;
}

function diagnostics(compiler: NodeCompiler, error: NodeError | null): Diagnostic[] {
  if (!error) return [];
  return (compiler.fetchDiagnostics(error) as Diagnostic[]).map(({ message, path }) => ({
    message,
    path,
  }));
}

/** Compiles `main` against `data` and the assets, then hands the document to `finish`. */
function compileWith<T>(
  compiler: NodeCompiler,
  main: string,
  data: unknown,
  assets: CompileJob["assets"],
  finish: (document: NodeTypstDocument) => T,
) {
  const shadows = [`${WORKSPACE}/data.json`];
  compiler.mapShadow(shadows[0]!, Buffer.from(JSON.stringify(data)));
  for (const [name, bytes] of Object.entries(assets)) {
    const path = `${WORKSPACE}/assets/${name}`;
    compiler.mapShadow(path, Buffer.from(bytes));
    shadows.push(path);
  }
  try {
    const result = compiler.compile({ mainFilePath: WORKSPACE + main });
    const error = result.takeError();
    if (error || !result.result) return { errors: diagnostics(compiler, error) };
    return { value: finish(result.result), warnings: diagnostics(compiler, result.takeWarnings()) };
  } finally {
    for (const path of shadows) compiler.unmapShadow(path);
    compiler.evictCache(0);
  }
}

/** One compile, with no check for broken fields. */
export function compileOnce(compiler: NodeCompiler, job: CompileJob): CompileOutcome {
  const { kind, data, assets, creationTimestamp } = job;
  const compiled = compileWith(compiler, MAIN[kind], data, assets, (document) =>
    compiler.pdf(document, { creationTimestamp }),
  );
  if (compiled.errors) return { ok: false, diagnostics: compiled.errors, broken: [] };
  return { ok: true, pdf: compiled.value, warnings: compiled.warnings };
}

/** Refuses to build a PDF with a broken field in it, and names the fields instead. */
export async function compileJob(compiler: NodeCompiler, job: CompileJob): Promise<CompileOutcome> {
  const compilers: Compilers<CompileOutcome> = {
    document: async (kind, data) => {
      const result = compileOnce(compiler, { ...job, kind, data });
      return { result, error: result.ok ? undefined : (result.diagnostics[0]?.message ?? "") };
    },
    field: async (check) =>
      compileWith(compiler, FIELD_MAIN, check, job.assets, () => undefined).errors?.[0]?.message,
  };
  const { result, broken } = await compileChecked(job.kind, job.data, compilers, { refuse: true });
  return result.ok ? result : { ...result, broken };
}
