import type { TypstInput } from "@burokrat/typst/browser";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { compilePages, getWorker } from "./compiler.ts";

class FakeWorker {
  static created: FakeWorker[] = [];
  onmessage?: (event: { data: unknown }) => void;
  onerror?: (event: ErrorEvent) => void;
  terminate = vi.fn();
  postMessage = vi.fn();

  constructor() {
    FakeWorker.created.push(this);
  }

  fail(message: string) {
    this.onerror!(new ErrorEvent("error", { message, cancelable: true }));
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it("fails waiting compiles when the worker dies, then starts a new worker", async () => {
  vi.stubGlobal("Worker", FakeWorker);
  const input = { data: { findings: [] }, assetIds: [] } as unknown as TypstInput;

  const loading = getWorker();
  FakeWorker.created[0]!.fail("no wasm");
  await expect(loading).rejects.toThrow("The preview compiler stopped: no wasm");
  expect(FakeWorker.created[0]!.terminate).toHaveBeenCalled();

  const compiling = compilePages("project", "finding", input, "view", 800);
  await vi.waitFor(() => expect(FakeWorker.created).toHaveLength(2));
  const second = FakeWorker.created[1]!;
  second.onmessage!({ data: "ready" });
  await vi.waitFor(() => expect(second.postMessage).toHaveBeenCalled());
  second.fail("crashed");
  await expect(compiling).rejects.toThrow("The preview compiler stopped: crashed");
});

it("runs only the newest waiting compile of a view", async () => {
  vi.stubGlobal("Worker", FakeWorker);
  const input = { data: { findings: [] }, assetIds: [] } as unknown as TypstInput;
  const workers = FakeWorker.created.length;
  const compile = () => compilePages("project", "finding", input, "coalesced", 800);

  const first = compile();
  const replaced = compile();
  const newest = compile();
  await expect(replaced).resolves.toBeUndefined();
  await vi.waitFor(() => expect(FakeWorker.created).toHaveLength(workers + 1));
  const worker = FakeWorker.created.at(-1)!;
  worker.onmessage!({ data: "ready" });
  await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledTimes(1));

  const reply = { errors: ["failed"] };
  worker.onmessage!({ data: reply });
  await expect(first).resolves.toBe(reply);
  await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledTimes(2));
  worker.onmessage!({ data: reply });
  await expect(newest).resolves.toBe(reply);
});
