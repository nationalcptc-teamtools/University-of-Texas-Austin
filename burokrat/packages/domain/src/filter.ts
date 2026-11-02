import type { MachineEntry } from "./content.ts";
import { MACHINE_SCOPES, parseServiceKey, STATUS_LABELS } from "./machines.ts";

/** The keys a filter can name, as in `status:foothold port:445 owner:me`. */
export const FILTER_KEYS = ["status", "scope", "owner", "port", "service", "os"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

export type MachineFilter = { terms: { key: FilterKey; value: string }[]; text: string[] };

/** A machine as an entry or as the mirror holds it, whose records carry a string `$cid`. */
type FilteredMachine = Pick<
  MachineEntry,
  "ip" | "hostname" | "os" | "status" | "scope" | "owner"
> & {
  services: Record<string, { name: string; product: string } | string>;
};

const servicesOf = (machine: FilteredMachine) =>
  Object.entries(machine.services).flatMap(([key, service]) =>
    typeof service === "string" ? [] : [{ key, ...service }],
  );

const squash = (value: string) => value.toLowerCase().replace(/[\s_-]+/g, "");

/** Reads a filter. A word that names no known key is plain text to find. */
export function parseFilter(query: string): MachineFilter {
  const filter: MachineFilter = { terms: [], text: [] };
  for (const word of query.trim().split(/\s+/).filter(Boolean)) {
    const [key, ...rest] = word.split(":");
    const value = rest.join(":").toLowerCase();
    if (rest.length > 0 && value && (FILTER_KEYS as readonly string[]).includes(key!.toLowerCase()))
      filter.terms.push({ key: key!.toLowerCase() as FilterKey, value });
    else filter.text.push(word.toLowerCase());
  }
  return filter;
}

/** `query` with the term `key:value` added, or removed if it is there. */
export function toggleTerm(query: string, key: FilterKey, value: string) {
  const term = `${key}:${value}`;
  const words = query.trim().split(/\s+/).filter(Boolean);
  const kept = words.filter((word) => word.toLowerCase() !== term.toLowerCase());
  return (kept.length < words.length ? kept : [...kept, term]).join(" ");
}

function statusMatches(status: MachineEntry["status"], value: string) {
  return (
    squash(status).startsWith(squash(value)) ||
    squash(STATUS_LABELS[status]).startsWith(squash(value))
  );
}

function termMatches(machine: FilteredMachine, key: FilterKey, value: string, me: string) {
  const services = servicesOf(machine);
  switch (key) {
    case "status":
      return statusMatches(machine.status, value);
    case "scope":
      return machine.scope === value || (value === "all" && MACHINE_SCOPES.includes(machine.scope));
    case "owner":
      return value === "me"
        ? machine.owner === me
        : value === "none"
          ? machine.owner === ""
          : machine.owner.toLowerCase().includes(value);
    case "port":
      return services.some((service) => String(parseServiceKey(service.key).port) === value);
    case "service":
      return services.some((service) => service.name.toLowerCase().includes(value));
    case "os":
      return machine.os.toLowerCase().includes(value);
  }
}

function textMatches(machine: FilteredMachine, word: string) {
  const fields = [
    machine.ip,
    machine.hostname,
    machine.os,
    machine.owner,
    ...servicesOf(machine).flatMap((service) => [service.name, service.product]),
  ];
  return fields.some((field) => field.toLowerCase().includes(word));
}

/**
 * Whether the machine passes the filter: terms with the same key are alternatives, different keys
 * must all match, and every word of text must appear somewhere. `owner:me` is `me`. Machines out
 * of scope only pass when the filter names a scope.
 */
export function matchesFilter(machine: FilteredMachine, filter: MachineFilter, me: string) {
  const keys = new Set(filter.terms.map((term) => term.key));
  if (machine.scope === "out" && !keys.has("scope")) return false;
  for (const key of keys) {
    const terms = filter.terms.filter((term) => term.key === key);
    if (!terms.some(({ value }) => termMatches(machine, key, value, me))) return false;
  }
  return filter.text.every((word) => textMatches(machine, word));
}
