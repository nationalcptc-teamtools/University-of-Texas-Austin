import { createFileRoute } from "@tanstack/react-router";
import { reportPdfUrl } from "../../../client/collections.ts";
import { DocumentPage } from "../../../client/components/DocumentPage.tsx";
import { ReportPreview } from "../../../client/preview/ReportPreview.tsx";
import { useProjectSession } from "../../../client/project-session.ts";
import { ReportEditor } from "../../../client/report/ReportEditor.tsx";

export const Route = createFileRoute("/_authed/p/$projectId/report")({
  component: ReportPage,
});

/** The report and the project's settings, which it shows, restore together. */
const SCOPE = [["report"], ["project"]];

function ReportPage() {
  const { session: user } = Route.useRouteContext();
  const session = useProjectSession();

  return (
    <DocumentPage
      title="Report"
      pdfHref={reportPdfUrl(session.projectId)}
      doc={session.doc}
      scope={SCOPE}
      preview={(shown) => <ReportPreview doc={shown} />}
    >
      <ReportEditor userName={user.name} />
    </DocumentPage>
  );
}
