import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Worker } from "node:worker_threads";
import type { CompileJob, CompileOutcome } from "./compile.ts";
import type { WorkerRequest, WorkerResponse } from "./worker.ts";

// Resolved through the package name so it still works once the caller is bundled.
const WORKER_PATH = join(
  dirname(createRequire(import.meta.url).resolve("@burokrat/typst/package.json")),
  "src/worker.ts",
);

type Pending = {
  job: CompileJob;
  resolve: (outcome: CompileOutcome) => void;
  reject: (error: Error) => void;
};

type Slot = {
  worker: Worker;
  ready: boolean;
  jobs: number;
  current?: { id: number; pending: Pending; timer: NodeJS.Timeout };
};

const TIMEOUT_MS = 30_000;
/** Typst's caches only grow, so a worker is replaced after this many compiles. */
const RECYCLE_AFTER = 500;
const MAX_QUEUE = 50;

/** Compiles on worker threads: compiles are synchronous and would block the event loop. */
export class TypstPool {
  private slots: Slot[];
  private queue: Pending[] = [];
  private nextId = 0;
  private closed = false;

  constructor({ size = 2 } = {}) {
    this.slots = Array.from({ length: size }, () => this.spawn());
  }

  compile(job: CompileJob): Promise<CompileOutcome> {
    if (this.closed) return Promise.reject(new Error("Typst pool is closed"));
    if (this.queue.length >= MAX_QUEUE) return Promise.reject(new Error("Too many PDFs queued"));
    return new Promise((resolve, reject) => {
      this.queue.push({ job, resolve, reject });
      this.drain();
    });
  }

  async close() {
    this.closed = true;
    for (const pending of this.queue.splice(0)) pending.reject(new Error("Typst pool is closed"));
    await Promise.all(this.slots.map((slot) => slot.worker.terminate()));
  }

  private spawn(): Slot {
    const worker = new Worker(WORKER_PATH);
    const slot: Slot = { worker, ready: false, jobs: 0 };
    worker.on("message", (message: WorkerResponse) => {
      if (message.type === "ready") {
        slot.ready = true;
        return this.drain();
      }
      const current = slot.current;
      if (current?.id !== message.id) return;
      clearTimeout(current.timer);
      slot.current = undefined;
      current.pending.resolve(message.outcome);
      if (++slot.jobs >= RECYCLE_AFTER) this.replace(slot);
      this.drain();
    });
    worker.on("error", (error) =>
      this.fail(slot, error instanceof Error ? error : new Error(String(error))),
    );
    worker.on("exit", () => this.fail(slot, new Error("Typst worker exited")));
    return slot;
  }

  private fail(slot: Slot, error: Error) {
    const current = slot.current;
    slot.current = undefined;
    if (current) {
      clearTimeout(current.timer);
      current.pending.reject(error);
    }
    this.replace(slot);
  }

  private replace(slot: Slot) {
    const index = this.slots.indexOf(slot);
    if (index === -1 || this.closed) return;
    void slot.worker.terminate();
    this.slots[index] = this.spawn();
  }

  private drain() {
    for (const slot of this.slots) {
      const pending = this.queue[0];
      if (!pending) return;
      if (!slot.ready || slot.current) continue;
      this.queue.shift();
      const id = this.nextId++;
      const timer = setTimeout(
        () => this.fail(slot, new Error(`Compile timed out after ${TIMEOUT_MS} ms`)),
        TIMEOUT_MS,
      );
      slot.current = { id, pending, timer };
      slot.worker.postMessage({ id, job: pending.job } satisfies WorkerRequest);
    }
  }
}
