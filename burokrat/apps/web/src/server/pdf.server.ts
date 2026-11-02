import { createHash } from "node:crypto";
import {
  findingInput,
  reportInput,
  TypstPool,
  type JobKind,
  type TypstInput,
} from "@burokrat/typst";
import { findingContentOf, liveFindings, oneLine } from "@burokrat/domain";
import { assetBytes } from "./assets.server.ts";
import { downloadName, readProject } from "./projects.server.ts";
import { getSession } from "./session.server.ts";

// One pool per process: dev reloads this module, and every copy would otherwise spawn workers.
const shared = globalThis as typeof globalThis & { burokratTypst?: TypstPool };
const pool = () => (shared.burokratTypst ??= new TypstPool());

/** Part of every ETag, so PDFs cached before a deploy with new templates are not reused. */
const STARTED = String(Date.now());

type TypstDocument = { kind: JobKind; input: TypstInput; name: string };

const text = (status: number, body: string) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

async function respond(request: Request, document: TypstDocument) {
  const { kind, input, name } = document;
  const hash = createHash("sha256").update(STARTED).update(kind).update(JSON.stringify(input));
  const etag = `W/"${hash.digest("base64url")}"`;
  const headers = { ETag: etag, "Cache-Control": "private, no-cache" };
  if (request.headers.get("If-None-Match") === etag)
    return new Response(null, { status: 304, headers });

  let outcome;
  try {
    outcome = await pool().compile({
      kind,
      data: input.data,
      assets: assetBytes(input.assetIds),
      creationTimestamp: Math.floor(Date.now() / 1000),
    });
  } catch (error) {
    return text(503, `The document could not be generated right now: ${(error as Error).message}`);
  }
  if (!outcome.ok) {
    console.error(`Typst ${kind} compile failed`, outcome.diagnostics);
    const errors =
      outcome.broken.length > 0
        ? outcome.broken.map(({ label, error }) => `${label}: ${error}`)
        : outcome.diagnostics.map(({ message }) => message);
    const lines = ["The document could not be generated:", ...errors.map((error) => `- ${error}`)];
    return text(500, lines.join("\n"));
  }
  return new Response(new Uint8Array(outcome.pdf), {
    headers: {
      ...headers,
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}"`,
    },
  });
}

export async function findingResponse(request: Request, projectId: string, findingId: string) {
  if (!(await getSession())) return text(401, "Sign in first.");
  const content = readProject(projectId);
  const finding = content?.findings[findingId];
  if (!content || !finding || finding.deleted) return text(404, "Finding not found.");
  return respond(request, {
    kind: "finding",
    input: findingInput(content.project, findingContentOf(finding)),
    name: downloadName(content.project, `${oneLine(finding.title).slice(0, 100) || "finding"}.pdf`),
  });
}

export async function reportResponse(request: Request, projectId: string) {
  if (!(await getSession())) return text(401, "Sign in first.");
  const content = readProject(projectId);
  if (!content) return text(404, "Project not found.");
  return respond(request, {
    kind: "report",
    input: reportInput(
      content.project,
      liveFindings(content.findings).map(findingContentOf),
      content.report,
    ),
    name: downloadName(content.project, "report.pdf"),
  });
}
