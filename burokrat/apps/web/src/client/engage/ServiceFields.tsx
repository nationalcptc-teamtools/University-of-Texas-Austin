import { Button, Input, Select, Text } from "@cloudflare/kumo";
import {
  compareServiceKeys,
  MAX_SERVICES,
  portLabel,
  SERVICE_KEY,
  serviceKeyOf,
  type MachineDraft,
  type MachineState,
  type Protocol,
} from "@burokrat/domain";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useState, type SubmitEvent } from "react";
import { SyncedInput } from "../editors/SyncedInput.tsx";
import type { UpdateMachine } from "./use-machines.ts";

type Props = { machine: MachineState; update: UpdateMachine };
type Service = MachineState["services"][string];
type ServiceDraft = MachineDraft["services"][string];

const PROTOCOLS = [
  { value: "tcp", label: "TCP" },
  { value: "udp", label: "UDP" },
];

const COLUMNS = "grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.4fr)_auto]";

/** The machine's open ports, lowest first. A port is added once; its key is its identity. */
export function ServiceFields({ machine, update }: Props) {
  const keys = Object.keys(machine.services).filter((key) => SERVICE_KEY.test(key));
  keys.sort(compareServiceKeys);
  return (
    <div className="@container flex flex-col">
      {keys.length > 0 ? (
        <div
          className={`grid gap-x-2 border-b border-kumo-line pb-2 text-sm font-medium ${COLUMNS}`}
        >
          <span>Port</span>
          <span>Service</span>
          <span>Version</span>
          <span>Note</span>
          <span className="w-8" />
        </div>
      ) : (
        <Text variant="secondary">No services yet.</Text>
      )}
      {keys.map((key) => (
        <ServiceRow
          key={key}
          serviceKey={key}
          service={machine.services[key]!}
          update={(write) => update((draft) => write(draft.services[key]!))}
          onDelete={() => update((draft) => void delete draft.services[key])}
        />
      ))}
      {keys.length < MAX_SERVICES && (
        <AddService
          taken={new Set(keys)}
          onAdd={(key) =>
            update((draft) => void (draft.services[key] = { name: "", product: "", note: "" }))
          }
        />
      )}
    </div>
  );
}

type ServiceRowProps = {
  serviceKey: string;
  service: Service;
  update: (write: (service: ServiceDraft) => void) => void;
  onDelete: () => void;
};

function ServiceRow({ serviceKey, service, update, onDelete }: ServiceRowProps) {
  const label = portLabel(serviceKey);
  return (
    <div className={`grid items-center gap-2 border-b border-kumo-line py-2 ${COLUMNS}`}>
      <span className="font-mono text-[0.9em]">{label}</span>
      <SyncedInput
        aria-label={`Service on ${label}`}
        placeholder="smb"
        value={service.name}
        maxLength={500}
        onChange={(event) => update((draft) => void (draft.name = event.target.value))}
      />
      <SyncedInput
        aria-label={`Version on ${label}`}
        value={service.product}
        maxLength={500}
        onChange={(event) => update((draft) => void (draft.product = event.target.value))}
      />
      <SyncedInput
        aria-label={`Note on ${label}`}
        value={service.note}
        maxLength={500}
        onChange={(event) => update((draft) => void (draft.note = event.target.value))}
      />
      <Button
        variant="ghost"
        size="sm"
        shape="square"
        icon={TrashIcon}
        aria-label={`Delete ${label}`}
        onClick={onDelete}
      />
    </div>
  );
}

type AddServiceProps = { taken: Set<string>; onAdd: (key: string) => void };

function AddService({ taken, onAdd }: AddServiceProps) {
  const [port, setPort] = useState("");
  const [protocol, setProtocol] = useState<Protocol>("tcp");
  const key = serviceKeyOf(Number(port), protocol);
  const error = !port || SERVICE_KEY.test(key) ? undefined : "Ports are 1 to 65535";
  const valid = SERVICE_KEY.test(key) && !taken.has(key);

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) return;
    onAdd(key);
    setPort("");
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 flex flex-wrap items-start gap-2">
      <Input
        aria-label="Port"
        placeholder="Port"
        inputMode="numeric"
        className="w-24"
        value={port}
        error={error ?? (taken.has(key) ? "Already listed" : undefined)}
        onChange={(event) => setPort(event.target.value.replace(/\D/g, "").slice(0, 5))}
      />
      <Select
        aria-label="Protocol"
        className="w-24"
        value={protocol}
        items={PROTOCOLS}
        onValueChange={(next) => next && setProtocol(next as Protocol)}
      />
      <Button type="submit" icon={PlusIcon} disabled={!valid}>
        Service
      </Button>
    </form>
  );
}
