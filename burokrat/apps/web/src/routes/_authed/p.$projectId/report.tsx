import { LinkButton } from "@cloudflare/kumo";
import { FileCodeIcon } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { reportPdfUrl, reportSourceUrl } from "../../../client/collections.ts";
import { DocumentPage } from "../../../client/components/DocumentPage.tsx";
import { ToolbarLabel } from "../../../client/components/PageHeader.tsx";
import { ReportPreview } from "../../../client/preview/ReportPreview.tsx";
import { useProjectSession } from "../../../client/project-session.ts";
import { CoverageGaps } from "../../../client/report/CoverageGaps.tsx";
import { ReportEditor } from "../../../client/report/ReportEditor.tsx";
import { useOnline } from "../../../client/use-connection.ts";

export const Route = createFileRoute("/_authed/p/$projectId/report")({
  component: ReportPage,
});

/** The report and the project's settings, which it shows, restore together. */
const SCOPE = [["report"], ["project"]];

function ReportPage() {
  const { session: user } = Route.useRouteContext();
  const session = useProjectSession();
  const online = useOnline();

  return (
    <DocumentPage
      title="Report"
      pdfHref={reportPdfUrl(session.projectId)}
      actions={
        <LinkButton
          href={reportSourceUrl(session.projectId)}
          variant="secondary"
          icon={FileCodeIcon}
          disabled={!online}
        >
          <ToolbarLabel>Typst</ToolbarLabel>
        </LinkButton>
      }
      doc={session.doc}
      scope={SCOPE}
      preview={(shown) => <ReportPreview doc={shown} />}
    >
      <div className="flex flex-col gap-4">
        <CoverageGaps />
        <ReportEditor userName={user.name} />
      </div>
    </DocumentPage>
  );
}
