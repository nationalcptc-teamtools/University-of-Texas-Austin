import { Button, Empty } from "@cloudflare/kumo";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { findingPdfUrl } from "../../../client/collections.ts";
import { DocumentPage } from "../../../client/components/DocumentPage.tsx";
import { setDeleted } from "../../../client/finding/actions.ts";
import { FindingEditor } from "../../../client/finding/FindingEditor.tsx";
import { FindingOwner } from "../../../client/finding/FindingOwner.tsx";
import { useFinding } from "../../../client/finding/use-finding-store.ts";
import { FindingPreview } from "../../../client/preview/FindingPreview.tsx";
import { useProjectSession } from "../../../client/project-session.ts";

export const Route = createFileRoute("/_authed/p/$projectId/f/$findingId")({
  component: FindingPage,
});

function FindingPage() {
  const { findingId } = Route.useParams();
  const { session: user } = Route.useRouteContext();
  const session = useProjectSession();
  const finding = useFinding(findingId);
  const scope = useMemo(() => [["findings", findingId]], [findingId]);

  if (!finding) return <Empty title="Finding not found" description="It may never have existed." />;
  if (finding.deleted) {
    return (
      <Empty
        title="This finding was deleted"
        description="Restoring it brings it back for everyone."
        contents={<Button onClick={() => setDeleted(session, findingId, false)}>Restore</Button>}
      />
    );
  }

  return (
    <DocumentPage
      title={finding.title || "Untitled"}
      pdfHref={findingPdfUrl(session.projectId, findingId)}
      actions={<FindingOwner findingId={findingId} owner={finding.owner} userName={user.name} />}
      doc={session.doc}
      scope={scope}
      preview={(shown) => <FindingPreview doc={shown} findingId={findingId} />}
    >
      <FindingEditor key={findingId} findingId={findingId} finding={finding} userName={user.name} />
    </DocumentPage>
  );
}
