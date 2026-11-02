import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../../../client/components/PageHeader.tsx";
import { ServiceTable } from "../../../../client/engage/ServiceTable.tsx";

export const Route = createFileRoute("/_authed/p/$projectId/engage/services")({
  component: ServicesPage,
});

function ServicesPage() {
  return (
    <>
      <PageHeader title="Services" />
      <div className="w-full px-6 py-5">
        <ServiceTable />
      </div>
    </>
  );
}
