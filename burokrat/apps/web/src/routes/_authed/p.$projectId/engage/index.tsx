import { Button, InputArea, LayerCard, Text } from "@cloudflare/kumo";
import { MACHINE_STATUSES, type MachineStatus } from "@burokrat/domain";
import { FileArrowUpIcon, PlusIcon } from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState, type SubmitEvent } from "react";
import { PageHeader } from "../../../../client/components/PageHeader.tsx";
import { formatAge, useMinuteClock } from "../../../../client/engage/claim-age.ts";
import { EngageText } from "../../../../client/engage/EngageText.tsx";
import { useImport } from "../../../../client/engage/ImportDialog.tsx";
import { machineLabel } from "../../../../client/engage/links.ts";
import { StatusBadge } from "../../../../client/engage/StatusBadge.tsx";
import { useMachineList, type Machine } from "../../../../client/engage/use-machines.ts";
import { useProjectSession } from "../../../../client/project-session.ts";
import { CoverageGaps } from "../../../../client/report/CoverageGaps.tsx";

export const Route = createFileRoute("/_authed/p/$projectId/engage/")({
  component: EngageOverview,
});

function EngageOverview() {
  const { session: user } = Route.useRouteContext();
  const machines = useMachineList().filter((machine) => machine.scope !== "out");

  return (
    <>
      <PageHeader title="Overview" />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-5">
        <section aria-label="Machines by status" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {MACHINE_STATUSES.map((status) => (
            <StatusCount key={status} status={status} machines={machines} />
          ))}
        </section>
        <CoverageGaps />
        <WhoIsOnWhat machines={machines} />
        <AddMachines />
        <LayerCard>
          <LayerCard.Secondary>Excluded from scope</LayerCard.Secondary>
          <LayerCard.Primary className="px-5 py-4">
            <EngageText
              field="outOfScope"
              userName={user.name}
              label="Addresses and ranges"
              placeholder={"10.0.0.5  # the PLC\n10.0.9.0/24"}
            />
          </LayerCard.Primary>
        </LayerCard>
      </div>
    </>
  );
}

function StatusCount({ status, machines }: { status: MachineStatus; machines: Machine[] }) {
  return (
    <LayerCard>
      <LayerCard.Primary className="flex flex-col items-start gap-2 px-4 py-3">
        <StatusBadge status={status} />
        <Text variant="heading" size="lg" as="span">
          {machines.filter((machine) => machine.status === status).length}
        </Text>
      </LayerCard.Primary>
    </LayerCard>
  );
}

/** Each person and the machines they claimed that are not done yet. */
function WhoIsOnWhat({ machines }: { machines: Machine[] }) {
  const { projectId } = useProjectSession();
  const now = useMinuteClock();
  const open = machines.filter((machine) => machine.owner && machine.status !== "owned");
  const owners = [...new Set(open.map((machine) => machine.owner))].sort((a, b) =>
    a.localeCompare(b),
  );
  if (owners.length === 0) return null;
  return (
    <LayerCard>
      <LayerCard.Secondary>Who is on what</LayerCard.Secondary>
      <LayerCard.Primary className="flex flex-col gap-3 px-5 py-4">
        {owners.map((owner) => (
          <div key={owner} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Text bold>{owner}</Text>
            {open
              .filter((machine) => machine.owner === owner)
              .map((machine) => (
                <Link
                  key={machine.id}
                  to="/p/$projectId/engage/m/$machineId"
                  params={{ projectId, machineId: machine.id }}
                  className="text-kumo-link hover:underline"
                >
                  {machineLabel(machine)}
                  {machine.claimedAt > 0 && (
                    <span className="ml-1 text-kumo-subtle">
                      · {formatAge(machine.claimedAt, now)}
                    </span>
                  )}
                </Link>
              ))}
          </div>
        ))}
      </LayerCard.Primary>
    </LayerCard>
  );
}

/** Adds machines from a list of addresses, a hosts file or an nmap XML scan, after a preview. */
function AddMachines() {
  const openImport = useImport();
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (openImport(text, "the addresses")) setText("");
  }

  async function onFile(file: File | undefined) {
    if (file) openImport(await file.text(), file.name);
  }

  return (
    <LayerCard id="add">
      <LayerCard.Secondary>Add machines</LayerCard.Secondary>
      <LayerCard.Primary className="px-5 py-4">
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <InputArea
            label="Addresses or a scan"
            description="One address per line, a hosts file, or nmap XML. You can also paste anywhere in Engage."
            rows={5}
            className="font-mono"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button icon={FileArrowUpIcon} onClick={() => input.current?.click()}>
              Import nmap XML
            </Button>
            <Button type="submit" variant="primary" icon={PlusIcon} disabled={!text.trim()}>
              Add
            </Button>
          </div>
          <input
            ref={input}
            type="file"
            accept=".xml,text/xml,application/xml"
            hidden
            onChange={(event) => {
              void onFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </form>
      </LayerCard.Primary>
    </LayerCard>
  );
}
