import { createFileRoute } from "@tanstack/react-router";
import { reportSourceResponse } from "../../../../server/pdf.server.ts";

export const Route = createFileRoute("/api/p/$projectId/report-typst.zip")({
  server: {
    handlers: {
      GET: ({ params }) => reportSourceResponse(params.projectId),
    },
  },
});
