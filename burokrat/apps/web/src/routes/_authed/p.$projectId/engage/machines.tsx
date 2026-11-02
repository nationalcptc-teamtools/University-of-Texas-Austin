import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../../../client/components/PageHeader.tsx";
import { MachineTable } from "../../../../client/engage/MachineTable.tsx";

export const Route = createFileRoute("/_authed/p/$projectId/engage/machines")({
  component: MachinesPage,
});

function MachinesPage() {
  const { session: user } = Route.useRouteContext();
  return (
    <>
      <PageHeader title="Machines" />
      <div className="w-full px-6 py-5">
        <MachineTable userName={user.name} />
      </div>
    </>
  );
}
