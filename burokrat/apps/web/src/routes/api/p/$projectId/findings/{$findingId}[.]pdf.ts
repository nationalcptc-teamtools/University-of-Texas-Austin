import { createFileRoute } from "@tanstack/react-router";
import { findingResponse } from "../../../../../server/pdf.server.ts";

export const Route = createFileRoute("/api/p/$projectId/findings/{$findingId}.pdf")({
  server: {
    handlers: {
      GET: ({ request, params }) => findingResponse(request, params.projectId, params.findingId),
    },
  },
});
