import type { FindingContent, MachineEntry } from "./content.ts";

/** How far the team is on a machine, in the order keys 1 to 5 set them. */
export const MACHINE_STATUSES = ["untouched", "progress", "foothold", "owned", "parked"] as const;
export type MachineStatus = (typeof MACHINE_STATUSES)[number];

export const STATUS_LABELS: Record<MachineStatus, string> = {
  untouched: "Untouched",
  progress: "In progress",
  foothold: "Foothold",
  owned: "Owned",
  parked: "Parked",
};

/** What the rules of engagement allow on a machine. */
export const MACHINE_SCOPES = ["in", "caution", "out"] as const;
export type MachineScope = (typeof MACHINE_SCOPES)[number];

export const SCOPE_LABELS: Record<MachineScope, string> = {
  in: "In scope",
  caution: "Caution",
  out: "Out of scope",
};

export type Protocol = "tcp" | "udp";

const IPV4_OCTET = String.raw`(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)`;
const IPV4 = String.raw`(?<![\d.])(?:${IPV4_OCTET}\.){3}${IPV4_OCTET}(?![\d.])`;
const HOST_LINE = new RegExp(String.raw`^\s*(${IPV4})[\s,;]+([A-Za-z][\w.-]*)`);

const ipv4Value = (ip: string) =>
  /^\d+\.\d+\.\d+\.\d+$/.test(ip)
    ? ip.split(".").reduce((value, octet) => value * 256 + Number(octet), 0)
    : undefined;

/** IPv4 addresses in numeric order, then anything else by its text. */
export function compareIps(a: string, b: string) {
  const [x, y] = [ipv4Value(a), ipv4Value(b)];
  if (x !== undefined && y !== undefined) return x - y;
  if (x !== undefined) return -1;
  if (y !== undefined) return 1;
  return a.localeCompare(b);
}

/**
 * The IPv4 addresses in pasted text, once each, in order. A line that reads like `/etc/hosts` or
 * a spreadsheet row, an address then a name, gives that address its hostname.
 */
export function parseHosts(text: string): { ip: string; hostname: string }[] {
  const hosts = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const named = HOST_LINE.exec(line);
    if (named) hosts.set(named[1]!, hosts.get(named[1]!) || named[2]!);
    for (const [ip] of line.matchAll(new RegExp(IPV4, "g"))) hosts.set(ip, hosts.get(ip) ?? "");
  }
  return [...hosts].map(([ip, hostname]) => ({ ip, hostname }));
}

export const serviceKeyOf = (port: number, protocol: Protocol) => `${port}/${protocol}`;

export function parseServiceKey(key: string) {
  const [port, protocol] = key.split("/");
  return { port: Number(port), protocol: protocol as Protocol };
}

/** Lowest port first, TCP before UDP. */
export function compareServiceKeys(a: string, b: string) {
  const [x, y] = [parseServiceKey(a), parseServiceKey(b)];
  return x.port - y.port || x.protocol.localeCompare(y.protocol);
}

/** A service's port as the report writes it, such as `TCP/445`. */
export function portLabel(key: string) {
  const { port, protocol } = parseServiceKey(key);
  return `${protocol.toUpperCase()}/${port}`;
}

/** The machines not deleted, by IP, with their ids. */
export function liveMachines<T extends { ip: string; deleted: boolean }>(
  machines: Record<string, T>,
): (T & { id: string })[] {
  return Object.entries(machines)
    .filter(([, machine]) => !machine.deleted)
    .map(([id, machine]) => ({ ...machine, id }))
    .sort((a, b) => compareIps(a.ip, b.ip) || a.id.localeCompare(b.id));
}

/** Scope rows for a finding's target machines, by IP, with the services it names on each. */
export function scopeWithTargets(
  targets: Record<string, Record<string, true>>,
  machines: Record<string, MachineEntry>,
): FindingContent["scope"] {
  return liveMachines(machines)
    .filter((machine) => targets[machine.id])
    .map((machine) => ({
      ip: machine.ip,
      name: machine.hostname,
      services: Object.keys(targets[machine.id]!)
        .filter((key) => machine.services[key])
        .sort(compareServiceKeys)
        .map((key) => ({ name: machine.services[key]!.name, port: portLabel(key) })),
    }));
}
