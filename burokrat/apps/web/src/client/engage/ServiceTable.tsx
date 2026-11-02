import { Button, Input, LayerCard, Table, Text } from "@cloudflare/kumo";
import {
  compareIps,
  compareServiceKeys,
  parseServiceKey,
  portLabel,
  SERVICE_KINDS,
  SERVICE_KIND_LABELS,
  serviceKindOf,
  serviceUrl,
  type ServiceKind,
} from "@burokrat/domain";
import { CopyIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useProjectSession } from "../project-session.ts";
import { copyTargets } from "./copy-targets.ts";
import { ScopeBadge, StatusBadge } from "./StatusBadge.tsx";
import { useMachineList, type Machine } from "./use-machines.ts";

type ServiceRow = {
  machine: Machine;
  key: string;
  name: string;
  product: string;
  note: string;
};

/** Every service on a machine not out of scope that matches `query`, by kind, address, port. */
function useServiceGroups(query: string) {
  const machines = useMachineList();
  return useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const groups = new Map<ServiceKind, ServiceRow[]>(SERVICE_KINDS.map((kind) => [kind, []]));
    for (const machine of machines) {
      if (machine.scope === "out") continue;
      for (const [key, service] of Object.entries(machine.services)) {
        if (typeof service === "string") continue;
        const row = {
          machine,
          key,
          name: service.name,
          product: service.product,
          note: service.note,
        };
        const text = [machine.ip, machine.hostname, key, row.name, row.product, row.note]
          .join(" ")
          .toLowerCase();
        if (words.every((word) => text.includes(word)))
          groups.get(serviceKindOf(key, row.name))!.push(row);
      }
    }
    return [...groups]
      .filter(([, rows]) => rows.length > 0)
      .map(([kind, rows]) => ({
        kind,
        rows: rows.sort(
          (a, b) => compareIps(a.machine.ip, b.machine.ip) || compareServiceKeys(a.key, b.key),
        ),
      }));
  }, [machines, query]);
}

/** The services the team found, by what they let a tester try, each kind one copy from a tool. */
export function ServiceTable() {
  const { projectId } = useProjectSession();
  const [query, setQuery] = useState("");
  const groups = useServiceGroups(query);

  return (
    <div className="flex flex-col gap-3">
      <Input
        aria-label="Filter services"
        placeholder="Filter by service, version, port or address"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <LayerCard className="overflow-x-auto p-0">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.Head>Address</Table.Head>
              <Table.Head>Port</Table.Head>
              <Table.Head>Service</Table.Head>
              <Table.Head>Version</Table.Head>
              <Table.Head>Note</Table.Head>
              <Table.Head>Status</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {groups.map((group) => (
              <ServiceGroup
                key={group.kind}
                kind={group.kind}
                rows={group.rows}
                projectId={projectId}
              />
            ))}
          </Table.Body>
        </Table>
        {groups.length === 0 && (
          <Text variant="secondary" DANGEROUS_className="block px-4 py-3">
            {query
              ? "No services match the filter."
              : "No services yet. Import an nmap scan to add them."}
          </Text>
        )}
      </LayerCard>
      <Text variant="secondary" size="xs">
        Copies hold machines in scope only; caution machines are listed but left out.
      </Text>
    </div>
  );
}

type GroupProps = { kind: ServiceKind; rows: ServiceRow[]; projectId: string };

function ServiceGroup({ kind, rows, projectId }: GroupProps) {
  const label = SERVICE_KIND_LABELS[kind];
  const copyLines = (line: (row: ServiceRow) => string, what: string) =>
    void copyTargets(
      rows.map((row) => ({ machine: row.machine, line: line(row) })),
      what,
    );
  return (
    <>
      <Table.Row>
        <Table.Cell colSpan={6} className="bg-kumo-tint">
          <span className="flex flex-wrap items-center gap-2">
            <Text bold>{label}</Text>
            <Text variant="secondary">{rows.length}</Text>
            <span className="flex-1" />
            <Button
              size="xs"
              variant="ghost"
              icon={CopyIcon}
              onClick={() => copyLines((row) => row.machine.ip, `${label} IPs`)}
            >
              Copy IPs
            </Button>
            {kind === "web" ? (
              <Button
                size="xs"
                variant="ghost"
                icon={CopyIcon}
                onClick={() =>
                  copyLines((row) => serviceUrl(row.machine.ip, row.key, row.name), "URLs")
                }
              >
                Copy URLs
              </Button>
            ) : (
              <Button
                size="xs"
                variant="ghost"
                icon={CopyIcon}
                onClick={() =>
                  copyLines(
                    (row) => `${row.machine.ip}:${parseServiceKey(row.key).port}`,
                    `${label} targets`,
                  )
                }
              >
                Copy ip:port
              </Button>
            )}
          </span>
        </Table.Cell>
      </Table.Row>
      {rows.map((row) => (
        <Table.Row key={`${row.machine.id}/${row.key}`}>
          <Table.Cell className="font-mono text-[0.9em]">
            <Link
              to="/p/$projectId/engage/m/$machineId"
              params={{ projectId, machineId: row.machine.id }}
              className="text-kumo-link hover:underline"
            >
              {row.machine.ip || "No IP"}
            </Link>
            {row.machine.hostname && (
              <span className="ml-2 font-sans text-kumo-subtle">{row.machine.hostname}</span>
            )}
          </Table.Cell>
          <Table.Cell className="font-mono text-[0.9em]">{portLabel(row.key)}</Table.Cell>
          <Table.Cell>{row.name}</Table.Cell>
          <Table.Cell className="max-w-64 truncate">{row.product}</Table.Cell>
          <Table.Cell className="max-w-64 truncate">{row.note}</Table.Cell>
          <Table.Cell>
            <span className="flex gap-1">
              <StatusBadge status={row.machine.status} />
              <ScopeBadge scope={row.machine.scope} note={row.machine.scopeNote} />
            </span>
          </Table.Cell>
        </Table.Row>
      ))}
    </>
  );
}
