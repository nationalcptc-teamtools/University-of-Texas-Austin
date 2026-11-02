import { Empty, Sidebar } from "@cloudflare/kumo";
import { createFileRoute, notFound, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { projectsCollection } from "../../client/collections.ts";
import { DocLoading } from "../../client/components/DocLoading.tsx";
import { ProjectPalette } from "../../client/components/ProjectPalette.tsx";
import { ProjectSidebar } from "../../client/components/ProjectSidebar.tsx";
import { cacheProjectImages, uploadPendingFiles } from "../../client/files.ts";
import {
  ProjectSessionContext,
  useProjectDoc,
  useProjectSession,
} from "../../client/project-session.ts";
import { storedWidth, storeWidth } from "../../client/stored-width.ts";
import { syncClient } from "../../client/sync-client.ts";
import { useOnline } from "../../client/use-connection.ts";
import { ProjectViewers, useProjectPresence } from "../../client/use-project-presence.ts";

const WIDTH_KEY = "burokrat:sidebar-width";

export const Route = createFileRoute("/_authed/p/$projectId")({
  loader: async ({ params: { projectId } }) => {
    await projectsCollection.preload();
    // The list may predate a project someone just shared a link to.
    if (!projectsCollection.has(projectId))
      await projectsCollection.utils.refetch().catch(() => {});
    if (!projectsCollection.has(projectId)) throw notFound();
  },
  component: ProjectLayout,
});

/** Opens the project's doc once, for every page in it. */
function ProjectLayout() {
  const { projectId } = Route.useParams();
  const { session } = Route.useRouteContext();
  const project = useProjectDoc(projectId, session.name);

  if (project.status === "removed") {
    return <Empty title="Project not found" description="It may have been removed." />;
  }
  if (project.status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        <DocLoading />
      </div>
    );
  }
  return (
    <ProjectSessionContext value={project.session}>
      <ProjectShell key={project.session.doc.peerIdStr} userName={session.name} />
    </ProjectSessionContext>
  );
}

function ProjectShell({ userName }: { userName: string }) {
  const session = useProjectSession();
  const page = useLocation({ select: (location) => location.pathname });
  const everyone = useProjectPresence(session.presence, { name: userName, page });
  const online = useOnline();
  const [searching, setSearching] = useState(false);
  const others = online ? everyone : [];

  useEffect(
    () =>
      syncClient().onStatusChange((status) => {
        if (status === "connected")
          void uploadPendingFiles().then(() => cacheProjectImages(session));
      }),
    [session],
  );

  return (
    <Sidebar.Provider
      collapsible="offcanvas"
      resizable
      defaultWidth={storedWidth(WIDTH_KEY)}
      maxWidth={400}
      onWidthChange={(width) => storeWidth(WIDTH_KEY, width)}
      className="h-screen"
    >
      <ProjectViewers value={{ others, page }}>
        <ProjectSidebar userName={userName} onSearch={() => setSearching(true)} />
        <main className="relative flex min-w-0 flex-1 flex-col overflow-y-auto">
          <Outlet />
        </main>
        <ProjectPalette open={searching} onOpenChange={setSearching} />
      </ProjectViewers>
    </Sidebar.Provider>
  );
}
