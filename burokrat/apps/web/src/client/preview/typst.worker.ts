import {
  compileChecked,
  FIELD_MAIN,
  FONT_URLS,
  MAIN,
  TEMPLATES,
  type Compilers,
  type FieldCheck,
} from "@burokrat/typst/sources";
import { createTypstCompiler, type TypstWorld } from "@myriaddreamin/typst.ts/compiler";
import { loadFonts } from "@myriaddreamin/typst.ts/options.init";
import { createTypstRenderer } from "@myriaddreamin/typst.ts/renderer";
import compilerWasmUrl from "@myriaddreamin/typst-ts-web-compiler/wasm?url";
import rendererWasmUrl from "@myriaddreamin/typst-ts-renderer/wasm?url";
import type { Anchor, CompileReply, CompileRequest, Page } from "./compiler.ts";
import type { Jump } from "./jumps.ts";

const encoder = new TextEncoder();

const compiler = (async () => {
  const instance = createTypstCompiler();
  await instance.init({
    getModule: () => compilerWasmUrl,
    beforeBuild: [loadFonts(FONT_URLS, { assets: false })],
  });
  for (const [path, source] of Object.entries(TEMPLATES)) instance.addSource(path, source);
  return instance;
})();

const renderer = (async () => {
  const instance = createTypstRenderer();
  await instance.init({ getModule: () => rendererWasmUrl });
  return instance;
})();

// A worker without a compiler or renderer is useless: crashing it makes the page start a new one.
Promise.all([compiler, renderer]).catch((error: unknown) =>
  setTimeout(() => {
    throw error;
  }),
);

/** The render key of every page the last view was sent, at the width it was drawn. */
let sent = { view: "", width: 0, keys: [] as string[] };

/** Draws every page whose content or size changed since `view` was last sent it. */
async function draw(vector: Uint8Array, view: string, width: number): Promise<Page[]> {
  const instance = await renderer;
  if (sent.view !== view || sent.width !== width) sent = { view, width, keys: [] };
  const keys = sent.keys;
  return instance.runWithSession({ format: "vector", artifactContent: vector }, async (session) => {
    const pages: Page[] = [];
    for (const { pageOffset, width: pageWidth, height } of session.retrievePagesInfo()) {
      const scale = width / pageWidth;
      const canvas = new OffscreenCanvas(width, Math.round(height * scale));
      const { cacheKey } = await instance.renderCanvas({
        renderSession: session,
        canvas: canvas.getContext("2d") as unknown as CanvasRenderingContext2D,
        pageOffset,
        pixelPerPt: scale,
        backgroundColor: "#ffffff",
        cacheKey: keys[pageOffset],
        dataSelection: { body: true },
      });
      const changed = keys[pageOffset] !== cacheKey;
      keys[pageOffset] = cacheKey;
      pages.push({
        width: pageWidth,
        height,
        bitmap: changed ? canvas.transferToImageBitmap() : undefined,
      });
    }
    keys.length = pages.length;
    return pages;
  });
}

type Compiled = { vector?: Uint8Array; anchors?: Anchor[]; jumps?: Jump[]; errors?: string[] };

/** Compiles `main` against `data`, then hands the world to `finish`; or returns Typst's errors. */
async function compileWith<T>(
  main: string,
  data: unknown,
  finish: (world: TypstWorld, vector: Uint8Array) => Promise<T>,
) {
  const instance = await compiler;
  instance.mapShadow("/data.json", encoder.encode(JSON.stringify(data)));
  return instance.runWithWorld({ mainFilePath: main }, async (world) => {
    const { result, diagnostics = [] } = await world.vector({ diagnostics: "full" });
    if (result) return { value: await finish(world, result) };
    const errors = diagnostics
      .filter(({ severity }) => severity.toLowerCase() === "error")
      .map(({ message }) => message);
    return { errors };
  });
}

const MAX_CHECKS = 1000;
/** Each field check's error, by everything the field could read: most edits leave the rest alone. */
const checks = new Map<string, string | undefined>();

const compilers: Compilers<Compiled> = {
  async document(kind, data) {
    const { value, errors } = await compileWith(MAIN[kind], data, async (world, vector) => {
      const [anchors = []] = await world.query<Anchor[][]>({
        selector: "<anchors>",
        field: "value",
      });
      const [jumps = []] = await world.query<Jump[][]>({ selector: "<jumps>", field: "value" });
      return { vector, anchors, jumps };
    });
    return value ? { result: value } : { result: { errors }, error: errors[0] ?? "" };
  },
  async field(check: FieldCheck) {
    const key = JSON.stringify(check);
    if (checks.has(key)) return checks.get(key);
    const { errors } = await compileWith(FIELD_MAIN, check, async () => undefined);
    const error = errors && (errors[0] ?? "");
    if (checks.size >= MAX_CHECKS) checks.clear();
    checks.set(key, error);
    return error;
  },
};

/**
 * Compiles with the words marked, so clicks on the pages can find their source. A document that
 * fails is checked and compiled again unmarked, so a marker can never be what breaks it.
 */
async function compile(request: CompileRequest): Promise<CompileReply> {
  const { kind, data, marked, assets, view, width } = request;
  const instance = await compiler;
  for (const [id, bytes] of Object.entries(assets)) instance.mapShadow(`/assets/${id}`, bytes);
  const first = await compilers.document(kind, marked);
  const { result, broken } =
    first.error === undefined
      ? { ...first, broken: [] }
      : await compileChecked(kind, data, compilers);
  if (!result.vector) return { errors: result.errors ?? [] };
  return {
    pages: width > 0 ? await draw(result.vector, view, width) : [],
    anchors: result.anchors ?? [],
    jumps: result.jumps ?? [],
    broken,
  };
}

// One compile at a time: the compiler's shadow files and the sent pages are shared state.
let queue = Promise.resolve();
self.onmessage = ({ data }: MessageEvent<CompileRequest>) => {
  queue = queue.then(async () => {
    let reply: CompileReply;
    try {
      reply = await compile(data);
    } catch (error) {
      reply = { errors: [(error as Error).message] };
    }
    const bitmaps = reply.pages?.flatMap(({ bitmap }) => bitmap ?? []) ?? [];
    self.postMessage(reply, { transfer: bitmaps });
  });
};
// Messages sent before the module has loaded can be dropped, so the page waits for this.
self.postMessage("ready");
