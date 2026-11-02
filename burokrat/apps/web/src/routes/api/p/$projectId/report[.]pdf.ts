import { createFileRoute } from "@tanstack/react-router";
import { reportResponse } from "../../../../server/pdf.server.ts";

export const Route = createFileRoute("/api/p/$projectId/report.pdf")({
  server: {
    handlers: {
      GET: ({ request, params }) => reportResponse(request, params.projectId),
    },
  },
});
