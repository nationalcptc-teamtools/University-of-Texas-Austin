import { createFileRoute } from "@tanstack/react-router";
import { ASSET_ID } from "@burokrat/domain";
import {
  MAX_ASSET_BYTES,
  readBlob,
  sniffImage,
  storeBlob,
} from "../../../../../server/assets.server.ts";
import { liveProject } from "../../../../../server/projects.server.ts";
import { getSession } from "../../../../../server/session.server.ts";

const text = (status: number, body: string) => new Response(body, { status });

/** The body, or `undefined` once it passes `limit` bytes: a declared length can lie. */
async function readLimited(request: Request, limit: number) {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of request.body ?? []) {
    size += chunk.byteLength;
    if (size > limit) return undefined;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** A file by its SHA-256, which clients compute themselves so they can use it offline. */
export const Route = createFileRoute("/api/p/$projectId/assets/$assetId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!(await getSession())) return text(401, "Sign in first.");
        const bytes = liveProject(params.projectId) && readBlob(params.assetId);
        if (!bytes) return text(404, "Asset not found.");
        return new Response(new Uint8Array(bytes), {
          headers: {
            "Content-Type": sniffImage(bytes) ?? "application/octet-stream",
            "Cache-Control": "private, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
      PUT: async ({ request, params }) => {
        if (!(await getSession())) return text(401, "Sign in first.");
        if (!liveProject(params.projectId) || !ASSET_ID.test(params.assetId)) {
          return text(404, "Asset not found.");
        }
        const bytes = await readLimited(request, MAX_ASSET_BYTES);
        if (!bytes) return text(413, "Files are limited to 50 MB.");
        try {
          storeBlob(params.assetId, bytes);
        } catch (error) {
          return text(422, (error as Error).message);
        }
        return new Response(null, { status: 204 });
      },
    },
  },
});
