import { parentPort } from "node:worker_threads";
import { compileJob, createCompiler, type CompileJob, type CompileOutcome } from "./compile.ts";

export type WorkerRequest = { id: number; job: CompileJob };
export type WorkerResponse =
  | { type: "ready" }
  | { type: "result"; id: number; outcome: CompileOutcome };

const port = parentPort!;
const compiler = createCompiler();
port.postMessage({ type: "ready" } satisfies WorkerResponse);

port.on("message", async ({ id, job }: WorkerRequest) => {
  port.postMessage({
    type: "result",
    id,
    outcome: await compileJob(compiler, job),
  } satisfies WorkerResponse);
});
