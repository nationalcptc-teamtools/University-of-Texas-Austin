import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../../../client/components/PageHeader.tsx";
import { ProjectFiles } from "../../../../client/engage/ProjectFiles.tsx";

export const Route = createFileRoute("/_authed/p/$projectId/engage/files")({
  component: FilesPage,
});

function FilesPage() {
  const { session: user } = Route.useRouteContext();
  return (
    <>
      <PageHeader title="Files" />
      <div className="mx-auto w-full max-w-4xl px-6 py-5">
        <ProjectFiles userName={user.name} />
      </div>
    </>
  );
}
