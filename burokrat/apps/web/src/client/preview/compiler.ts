import type { BrokenField, JobKind, TypstInput } from "@burokrat/typst/browser";
import { assetUrl } from "../collections.ts";
import { markJumps, type Jump } from "./jumps.ts";

export type CompileRequest = {
  kind: JobKind;
  data: TypstInput["data"];
  /** `data` with its editable fields' words marked, so the reply can say where they landed. */
  marked: TypstInput["data"];
  /** Only assets the worker has not been sent yet; it keeps them mapped. */
  assets: Record<string, Uint8Array>;
  /** The preview asking, so the worker sends only the pages it does not show yet. */
  view: string;
  /** How many device pixels wide to draw each page, or 0 to only compile. */
  width: number;
};

/** Where an editor field starts: a page number, and a fraction of that page's height. */
export type Anchor = { name: string; page: number; y: number };

/** A page's size in points, and its drawing unless it is unchanged since the view's last reply. */
export type Page = { width: number; height: number; bitmap?: ImageBitmap };

export type CompileReply =
  | { pages: Page[]; anchors: Anchor[]; jumps: Jump[]; broken: BrokenField[]; errors?: undefined }
  | { errors: string[]; pages?: undefined };

let worker: Promise<Worker> | undefined;
const replies: { resolve: (reply: CompileReply) => void; reject: (error: Error) => void }[] = [];
const sent = new Set<string>();
const assetBytes = new Map<string, Promise<Uint8Array | undefined>>();

/**
 * The worker, its 28 MB compiler and its renderer load on first use, so pages without a preview never fetch them.
 * If the worker fails to load or crashes, waiting compiles fail and the next one starts a new worker.
 */
export function getWorker() {
  worker ??= new Promise((resolve, reject) => {
    const instance = new Worker(new URL("./typst.worker.ts", import.meta.url), { type: "module" });
    instance.onmessage = ({ data }: MessageEvent<CompileReply | "ready">) => {
      if (data === "ready") resolve(instance);
      else replies.shift()?.resolve(data);
    };
    instance.onerror = (event) => {
      event.preventDefault();
      instance.terminate();
      worker = undefined;
      sent.clear();
      const error = new Error(
        `The preview compiler stopped: ${event.message || "it did not load"}`,
      );
      reject(error);
      for (const reply of replies.splice(0)) reply.reject(error);
    };
  });
  return worker;
}

/**
 * A missing asset is left out, so Typst reports it like the server would. Only found assets are
 * cached: one referenced mid-upload, or hit by a network error, is fetched again next compile.
 */
function fetchAsset(projectId: string, assetId: string) {
  let bytes = assetBytes.get(assetId);
  if (!bytes) {
    bytes = fetch(assetUrl(projectId, assetId))
      .then(async (response) =>
        response.ok ? new Uint8Array(await response.arrayBuffer()) : undefined,
      )
      .catch(() => undefined);
    assetBytes.set(assetId, bytes);
    void bytes.then((found) => found || assetBytes.delete(assetId));
  }
  return bytes;
}

/** Compiles and draws the pages in the worker. Replies arrive in request order. */
async function compileNow(
  projectId: string,
  kind: JobKind,
  input: TypstInput,
  view: string,
  width: number,
): Promise<CompileReply> {
  const ids = input.assetIds.filter((id) => !sent.has(id));
  const fetched = await Promise.all(ids.map((id) => fetchAsset(projectId, id)));
  const assets: Record<string, Uint8Array> = {};
  for (const [index, id] of ids.entries()) {
    const bytes = fetched[index];
    if (bytes) assets[id] = bytes;
  }
  const target = await getWorker();
  for (const id of Object.keys(assets)) sent.add(id);
  return new Promise((resolve, reject) => {
    replies.push({ resolve, reject });
    const marked = markJumps(input.data);
    target.postMessage({
      kind,
      data: input.data,
      marked,
      assets,
      view,
      width,
    } satisfies CompileRequest);
  });
}

type Queued = {
  args: Parameters<typeof compileNow>;
  resolve: (reply: CompileReply | undefined) => void;
  reject: (error: Error) => void;
};

/** Per view: the newest request waiting for the one in flight. */
const queued = new Map<string, Queued>();
const running = new Set<string>();

async function drain(view: string) {
  if (running.has(view)) return;
  running.add(view);
  for (let next; (next = queued.get(view));) {
    queued.delete(view);
    await compileNow(...next.args).then(next.resolve, next.reject);
  }
  running.delete(view);
}

/**
 * Compiles and draws the pages for one preview `view`. Only its newest request runs once the one
 * in flight finishes, so fast typing never queues up; a request replaced before it ran resolves
 * to `undefined`.
 */
export function compilePages(...args: Parameters<typeof compileNow>) {
  const view = args[3];
  queued.get(view)?.resolve(undefined);
  return new Promise<CompileReply | undefined>((resolve, reject) => {
    queued.set(view, { args, resolve, reject });
    void drain(view);
  });
}
