import { Button, Text } from "@cloudflare/kumo";
import type { FindingDraft, FindingState } from "@burokrat/domain";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { MoveButtons } from "../components/MoveButtons.tsx";
import type { UpdateFinding } from "./use-finding-store.ts";
import { SyncedInput } from "../editors/SyncedInput.tsx";

type Props = { finding: FindingState; update: UpdateFinding };
type Hosts = FindingDraft["scope"];
type Host = FindingState["scope"][number];

const COLUMNS = "@xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)_auto]";

/** One row per host, its services nested in the last column; stacked when the column is narrow. */
export function ScopeFields({ finding, update }: Props) {
  const hosts = finding.scope;
  const updateHosts = (write: (hosts: Hosts) => void) => update((draft) => write(draft.scope));
  return (
    <div className="@container flex flex-col">
      {hosts.length > 0 && (
        <div
          className={`hidden gap-x-2 border-b border-kumo-line pb-2 text-sm font-medium @xl:grid ${COLUMNS}`}
        >
          <span>IP address</span>
          <span>Hostname</span>
          <span>Services</span>
          <span className="w-24" />
        </div>
      )}
      {hosts.map((host, index) => (
        <HostRow
          key={host.$cid}
          host={host}
          index={index}
          count={hosts.length}
          updateHosts={updateHosts}
        />
      ))}
      {hosts.length === 0 && <Text variant="secondary">No hosts yet.</Text>}
      <Button
        icon={PlusIcon}
        className="mt-3 self-start"
        onClick={() => updateHosts((list) => void list.push({ ip: "", name: "", services: [] }))}
      >
        Host
      </Button>
    </div>
  );
}

type HostRowProps = {
  host: Host;
  index: number;
  count: number;
  updateHosts: (write: (hosts: Hosts) => void) => void;
};

function HostRow({ host, index, count, updateHosts }: HostRowProps) {
  const updateHost = (write: (host: Hosts[number]) => void) =>
    updateHosts((list) => write(list[index]!));
  const updateServices = (write: (services: Hosts[number]["services"]) => void) =>
    updateHost((draft) => write(draft.services));
  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-2 border-b border-kumo-line py-3 ${COLUMNS}`}
    >
      <SyncedInput
        aria-label="IP address"
        placeholder="IP address"
        value={host.ip}
        maxLength={500}
        onChange={(event) => updateHost((draft) => void (draft.ip = event.target.value))}
      />
      <SyncedInput
        aria-label="Hostname"
        placeholder="Hostname"
        value={host.name}
        maxLength={500}
        onChange={(event) => updateHost((draft) => void (draft.name = event.target.value))}
      />
      <div className="order-last col-span-3 flex flex-col gap-2 @xl:order-none @xl:col-span-1">
        {host.services.map((service, serviceIndex) => (
          <ServiceRow
            key={service.$cid}
            service={service}
            update={(write) => updateServices((list) => write(list[serviceIndex]!))}
            onDelete={() => updateServices((list) => void list.splice(serviceIndex, 1))}
          />
        ))}
        <Button
          variant="ghost"
          size="sm"
          icon={PlusIcon}
          className="self-start"
          onClick={() => updateServices((list) => void list.push({ name: "", port: "" }))}
        >
          Service
        </Button>
      </div>
      <div>
        <MoveButtons index={index} count={count} label="host" update={updateHosts} />
      </div>
    </div>
  );
}

type Service = Host["services"][number];

type ServiceRowProps = {
  service: Service;
  update: (write: (service: Hosts[number]["services"][number]) => void) => void;
  onDelete: () => void;
};

function ServiceRow({ service, update, onDelete }: ServiceRowProps) {
  return (
    <div className="flex items-center gap-2">
      <SyncedInput
        aria-label="Service"
        placeholder="Service, e.g. SMB"
        className="min-w-0 flex-1"
        value={service.name}
        maxLength={500}
        onChange={(event) => update((draft) => void (draft.name = event.target.value))}
      />
      <SyncedInput
        aria-label="Port"
        placeholder="TCP/445"
        className="w-24"
        value={service.port}
        maxLength={500}
        onChange={(event) => update((draft) => void (draft.port = event.target.value))}
      />
      <Button
        variant="ghost"
        size="sm"
        shape="square"
        icon={TrashIcon}
        aria-label="Delete service"
        onClick={onDelete}
      />
    </div>
  );
}
