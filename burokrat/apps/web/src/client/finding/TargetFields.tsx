import { Button, Checkbox, Select, Text } from "@cloudflare/kumo";
import { compareServiceKeys, portLabel, SERVICE_KEY, type FindingState } from "@burokrat/domain";
import { XIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { machineLabel } from "../engage/links.ts";
import { StatusBadge } from "../engage/StatusBadge.tsx";
import { useMachineList, type Machine } from "../engage/use-machines.ts";
import { useProjectSession } from "../project-session.ts";
import type { UpdateFinding } from "./use-finding-store.ts";

type Props = { finding: FindingState; update: UpdateFinding };

/**
 * The machines from Engage the finding affects, and which of their services. The report lists
 * them as the machines are when it is built, ahead of the hosts typed below.
 */
export function TargetFields({ finding, update }: Props) {
  const machines = useMachineList();
  const targeted = machines.filter((machine) => finding.targets[machine.id]);
  const addable = machines
    .filter((machine) => !finding.targets[machine.id])
    .map((machine) => ({ value: machine.id, label: machineLabel(machine) }));

  return (
    <div className="flex flex-col gap-2">
      {targeted.map((machine) => (
        <TargetRow
          key={machine.id}
          machine={machine}
          services={finding.targets[machine.id]!}
          update={update}
        />
      ))}
      {machines.length === 0 ? (
        <Text variant="secondary">Machines added in Engage can be picked here.</Text>
      ) : (
        addable.length > 0 && (
          <Select
            aria-label="Add a machine"
            placeholder="Add a machine"
            className="self-start"
            value={null}
            items={addable}
            onValueChange={(machineId) =>
              machineId && update((draft) => void (draft.targets[machineId] = {}))
            }
          />
        )
      )}
    </div>
  );
}

type RowProps = {
  machine: Machine;
  services: FindingState["targets"][string];
  update: UpdateFinding;
};

function TargetRow({ machine, services, update }: RowProps) {
  const { projectId } = useProjectSession();
  const keys = Object.keys(machine.services).filter((key) => SERVICE_KEY.test(key));
  keys.sort(compareServiceKeys);

  function toggle(key: string, on: boolean) {
    update((draft) => {
      if (on) draft.targets[machine.id]![key] = true;
      else delete draft.targets[machine.id]![key];
    });
  }

  return (
    <div className="flex flex-col gap-2 border-b border-kumo-line pb-2">
      <div className="flex items-center gap-2">
        <Link
          to="/p/$projectId/engage/m/$machineId"
          params={{ projectId, machineId: machine.id }}
          className="min-w-0 truncate text-kumo-link hover:underline"
        >
          {machineLabel(machine)}
        </Link>
        <StatusBadge status={machine.status} />
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          shape="square"
          icon={XIcon}
          aria-label={`Remove ${machineLabel(machine)}`}
          onClick={() => update((draft) => void delete draft.targets[machine.id])}
        />
      </div>
      {keys.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {keys.map((key) => (
            <Checkbox
              key={key}
              label={[portLabel(key), machine.services[key]!.name].filter(Boolean).join(" ")}
              checked={Boolean(services[key])}
              onCheckedChange={(on) => toggle(key, on)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
