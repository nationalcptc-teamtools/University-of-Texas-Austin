import { createFileRoute } from "@tanstack/react-router";
import { downloadName, readProject } from "../../../../server/projects.server.ts";
import { getSession } from "../../../../server/session.server.ts";
import { exportProject } from "../../../../server/transfer.server.ts";

export const Route = createFileRoute("/api/p/$projectId/export.zip")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!(await getSession())) return new Response("Sign in first.", { status: 401 });
        const content = readProject(params.projectId);
        if (!content) return new Response("Project not found.", { status: 404 });
        return new Response(new Uint8Array(exportProject(content)), {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${downloadName(content.project, "export.zip")}"`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
