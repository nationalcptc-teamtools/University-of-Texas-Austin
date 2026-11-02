import type { LoroMap } from "loro-crdt";
import type { MachineEntry } from "./content.ts";
import { writeMachine } from "./docs.ts";
import { liveMachines, type MachineScope } from "./machines.ts";

export type ScannedService = { name: string; product: string };

/** A host as a scan found it. Its services are keyed by port and protocol, such as `445/tcp`. */
export type ScannedHost = {
  ip: string;
  hostname: string;
  os: string;
  services: Record<string, ScannedService>;
};

/** What a scan adds to a machine already in the project: only fields that were empty. */
export type MachineUpdate = {
  id: string;
  ip: string;
  hostname?: string;
  os?: string;
  newServices: Record<string, ScannedService>;
  filledServices: Record<string, Partial<ScannedService>>;
};

export type ScanPlan = { added: ScannedHost[]; updates: MachineUpdate[] };

export type ScanSummary = {
  /** New machines. */
  machines: number;
  /** New services, on new and existing machines. */
  services: number;
  /** Existing machines that change. */
  updated: number;
};

const orElse = (current: string, scanned: string) => current || scanned;

/** One host per IP: the first value found for each field wins, and no service is lost. */
function mergeByIp(hosts: ScannedHost[]): ScannedHost[] {
  const merged = new Map<string, ScannedHost>();
  for (const host of hosts) {
    const known = merged.get(host.ip);
    if (!known) {
      merged.set(host.ip, { ...host, services: { ...host.services } });
      continue;
    }
    known.hostname = orElse(known.hostname, host.hostname);
    known.os = orElse(known.os, host.os);
    for (const [key, service] of Object.entries(host.services)) {
      const have = known.services[key];
      known.services[key] = have
        ? { name: orElse(have.name, service.name), product: orElse(have.product, service.product) }
        : service;
    }
  }
  return [...merged.values()];
}

function emptyFields(current: Partial<ScannedService>, scanned: ScannedService) {
  const fill: Partial<ScannedService> = {};
  if (!current.name && scanned.name) fill.name = scanned.name;
  if (!current.product && scanned.product) fill.product = scanned.product;
  return fill;
}

function updateOf(id: string, machine: MachineEntry, host: ScannedHost): MachineUpdate | undefined {
  const update: MachineUpdate = {
    id,
    ip: machine.ip,
    newServices: {},
    filledServices: {},
  };
  if (!machine.hostname && host.hostname) update.hostname = host.hostname;
  if (!machine.os && host.os) update.os = host.os;
  for (const [key, scanned] of Object.entries(host.services)) {
    const current = machine.services[key];
    if (!current) {
      update.newServices[key] = scanned;
      continue;
    }
    const fill = emptyFields(current, scanned);
    if (Object.keys(fill).length) update.filledServices[key] = fill;
  }
  const changed =
    update.hostname !== undefined ||
    update.os !== undefined ||
    Object.keys(update.newServices).length > 0 ||
    Object.keys(update.filledServices).length > 0;
  return changed ? update : undefined;
}

/**
 * What importing a scan would do. Machines match on IP and services on port and protocol. A scan
 * only fills what is empty and adds what is missing; it never changes what a person typed or
 * removes anything.
 */
export function planScan(machines: Record<string, MachineEntry>, hosts: ScannedHost[]): ScanPlan {
  const byIp = new Map<string, { id: string } & MachineEntry>();
  for (const machine of liveMachines(machines))
    if (!byIp.has(machine.ip)) byIp.set(machine.ip, machine);

  const plan: ScanPlan = { added: [], updates: [] };
  for (const host of mergeByIp(hosts)) {
    const machine = byIp.get(host.ip);
    if (!machine) {
      plan.added.push(host);
      continue;
    }
    const update = updateOf(machine.id, machine, host);
    if (update) plan.updates.push(update);
  }
  return plan;
}

export function summarizeScan({ added, updates }: ScanPlan): ScanSummary {
  const addedServices = added.reduce((sum, host) => sum + Object.keys(host.services).length, 0);
  const newServices = updates.reduce(
    (sum, update) => sum + Object.keys(update.newServices).length,
    0,
  );
  return { machines: added.length, services: addedServices + newServices, updated: updates.length };
}

/** Writes a plan to the project's machines map. The caller commits. */
export function applyScan(
  machines: LoroMap,
  { added, updates }: ScanPlan,
  meta: { author: string; now: number; newId: () => string; scopeOf: (ip: string) => MachineScope },
) {
  for (const { services, ...host } of added) {
    writeMachine(machines, meta.newId(), {
      ...host,
      status: "untouched",
      scope: meta.scopeOf(host.ip),
      scopeNote: "",
      services: Object.fromEntries(
        Object.entries(services).map(([key, service]) => [key, { ...service, note: "" }]),
      ),
      notes: "",
      owner: "",
      claimedAt: 0,
      createdBy: meta.author,
      createdAt: meta.now,
      deleted: false,
    });
  }
  for (const update of updates) applyUpdate(machines.ensureMergeableMap(update.id), update);
}

function setFields(map: LoroMap, fields: Partial<Record<string, string>>) {
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) map.set(key, value);
}

function applyUpdate(
  machine: LoroMap,
  { hostname, os, newServices, filledServices }: MachineUpdate,
) {
  setFields(machine, { hostname, os });
  const services = machine.ensureMergeableMap("services");
  for (const [key, service] of Object.entries(newServices))
    setFields(services.ensureMergeableMap(key), { ...service, note: "" });
  for (const [key, fill] of Object.entries(filledServices))
    setFields(services.ensureMergeableMap(key), fill);
}
