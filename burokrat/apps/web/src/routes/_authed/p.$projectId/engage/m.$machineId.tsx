import { Button, Empty, LayerCard } from "@cloudflare/kumo";
import { HandGrabbingIcon, TrashIcon } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PageHeader, ToolbarLabel } from "../../../../client/components/PageHeader.tsx";
import { PageViewers } from "../../../../client/components/PageViewers.tsx";
import { claimMachines, setMachineDeleted } from "../../../../client/engage/actions.ts";
import { CredentialList } from "../../../../client/engage/CredentialList.tsx";
import { machineLabel } from "../../../../client/engage/links.ts";
import { MachineFields } from "../../../../client/engage/MachineFields.tsx";
import { MachineFiles } from "../../../../client/engage/MachineFiles.tsx";
import { MachineFindings } from "../../../../client/engage/MachineFindings.tsx";
import { MachineNotes } from "../../../../client/engage/MachineNotes.tsx";
import { ServiceFields } from "../../../../client/engage/ServiceFields.tsx";
import { ScopeBadge, ScopeWarning, StatusBadge } from "../../../../client/engage/StatusBadge.tsx";
import { useMachine, useUpdateMachine } from "../../../../client/engage/use-machines.ts";
import { unitOf, useProjectSession } from "../../../../client/project-session.ts";
import { STRUCT, undoFormEdits } from "../../../../client/undo-registry.ts";

export const Route = createFileRoute("/_authed/p/$projectId/engage/m/$machineId")({
  component: MachinePage,
});

function MachinePage() {
  const { machineId } = Route.useParams();
  const { session: user } = Route.useRouteContext();
  const session = useProjectSession();
  const machine = useMachine(machineId);
  const update = useUpdateMachine(machineId);

  if (!machine) return <Empty title="Machine not found" description="It may never have existed." />;
  if (machine.deleted) {
    return (
      <Empty
        title="This machine was deleted"
        description="Restoring it brings it back for everyone."
        contents={
          <Button onClick={() => setMachineDeleted(session, machineId, false)}>Restore</Button>
        }
      />
    );
  }

  const claimed = machine.owner === user.name;
  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <span className="truncate">{machineLabel(machine)}</span>
            <StatusBadge status={machine.status} />
            <ScopeBadge scope={machine.scope} note={machine.scopeNote} />
          </span>
        }
      >
        <PageViewers />
        {machine.owner && !claimed && (
          <span className="truncate text-kumo-subtle max-md:hidden">{machine.owner} is on it</span>
        )}
        <Button
          variant="secondary"
          icon={HandGrabbingIcon}
          aria-pressed={claimed}
          onClick={() => claimMachines(session, [machineId], claimed ? "" : user.name)}
        >
          <ToolbarLabel>{claimed ? "Release" : "Claim"}</ToolbarLabel>
        </Button>
        <Button
          variant="ghost"
          shape="square"
          icon={TrashIcon}
          aria-label="Delete machine"
          onClick={() => setMachineDeleted(session, machineId, true)}
        />
      </PageHeader>
      <div
        className="mx-auto grid w-full max-w-6xl gap-4 px-6 py-5 lg:grid-cols-[minmax(0,1fr)_20rem]"
        onKeyDown={undoFormEdits(session.undo, unitOf(machineId, STRUCT))}
      >
        <div className="flex min-w-0 flex-col gap-4">
          <ScopeWarning scope={machine.scope} note={machine.scopeNote} />
          <Section title="Machine">
            <MachineFields machine={machine} update={update} />
          </Section>
          <Section title="Notes">
            <MachineNotes key={machineId} machineId={machineId} userName={user.name} />
          </Section>
          <Section title="Services">
            <ServiceFields machine={machine} update={update} />
          </Section>
        </div>
        <aside className="flex min-w-0 flex-col gap-4">
          <Section title="Findings">
            <MachineFindings machineId={machineId} />
          </Section>
          <Section title="Files">
            <MachineFiles machineId={machineId} userName={user.name} />
          </Section>
          <Section title="Credentials">
            <CredentialList machineId={machineId} userName={user.name} />
          </Section>
        </aside>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <LayerCard render={<section aria-label={title} />}>
      <LayerCard.Secondary>
        <h2>{title}</h2>
      </LayerCard.Secondary>
      <LayerCard.Primary className="flex flex-col gap-4 px-5 py-4">{children}</LayerCard.Primary>
    </LayerCard>
  );
}
