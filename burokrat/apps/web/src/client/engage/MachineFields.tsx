import { Select } from "@cloudflare/kumo";
import type { MachineState } from "@burokrat/domain";
import { SyncedInput } from "../editors/SyncedInput.tsx";
import { SCOPE_ITEMS, STATUS_ITEMS } from "./StatusBadge.tsx";
import type { UpdateMachine } from "./use-machines.ts";

type Props = { machine: MachineState; update: UpdateMachine };

const TEXT_FIELDS = [
  { key: "ip", label: "IP address", placeholder: "10.0.0.23" },
  { key: "hostname", label: "Hostname", placeholder: "dc01.corp.local" },
  { key: "os", label: "Operating system", placeholder: "Windows Server 2019" },
] as const;

/** What the machine is, how far the team is on it, and what the rules allow on it. */
export function MachineFields({ machine, update }: Props) {
  return (
    <div className="@container">
      <div className="grid gap-4 @sm:grid-cols-2 @2xl:grid-cols-3">
        {TEXT_FIELDS.map(({ key, ...field }) => (
          <SyncedInput
            key={key}
            maxLength={500}
            value={machine[key]}
            onChange={(event) => update((draft) => void (draft[key] = event.target.value))}
            {...field}
          />
        ))}
        <Select
          label="Status"
          value={machine.status}
          items={STATUS_ITEMS}
          onValueChange={(status) => status && update((draft) => void (draft.status = status))}
        />
        <Select
          label="Scope"
          value={machine.scope}
          items={SCOPE_ITEMS}
          onValueChange={(scope) => scope && update((draft) => void (draft.scope = scope))}
        />
        <SyncedInput
          label="Why"
          placeholder="PLC, read only; production database, no brute force"
          maxLength={500}
          value={machine.scopeNote}
          onChange={(event) => update((draft) => void (draft.scopeNote = event.target.value))}
        />
      </div>
    </div>
  );
}
