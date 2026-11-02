import { createFileRoute } from "@tanstack/react-router";
import { findingContentOf, oneLine } from "@burokrat/domain";
import { downloadName, readProject } from "../../../../../server/projects.server.ts";
import { getSession } from "../../../../../server/session.server.ts";

export const Route = createFileRoute("/api/p/$projectId/findings/{$findingId}.json")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!(await getSession())) return new Response("Sign in first.", { status: 401 });
        const content = readProject(params.projectId);
        const finding = content?.findings[params.findingId];
        if (!content || !finding || finding.deleted) {
          return new Response("Finding not found.", { status: 404 });
        }
        const title = oneLine(finding.title).slice(0, 100) || "finding";
        const name = downloadName(content.project, `${title}.json`);
        return Response.json(findingContentOf(finding), {
          headers: {
            "Content-Disposition": `attachment; filename="${name}"`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
