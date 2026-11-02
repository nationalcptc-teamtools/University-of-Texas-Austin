import { parseServiceKey } from "./machines.ts";

/** What a service lets a tester try, the way the team splits up the work. */
export const SERVICE_KINDS = [
  "web",
  "smb",
  "directory",
  "remote",
  "database",
  "mail",
  "ot",
  "other",
] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];

export const SERVICE_KIND_LABELS: Record<ServiceKind, string> = {
  web: "Web",
  smb: "SMB and RPC",
  directory: "Directory",
  remote: "Remote access",
  database: "Databases",
  mail: "Mail",
  ot: "OT",
  other: "Other",
};

/** Names nmap gives, matched from their start once `ssl/` is dropped. */
const NAMES: [ServiceKind, RegExp][] = [
  ["web", /^(?:https?|http-|www)/],
  ["smb", /^(?:microsoft-ds|netbios|msrpc|epmap|smb)/],
  ["directory", /^(?:kerberos|kpasswd|ldap|globalcat|domain$|dns)/],
  ["remote", /^(?:ssh|ms-wbt-server|rdp|telnet|vnc|wsman|winrm|x11|rlogin|rsh)/],
  ["database", /^(?:ms-sql|mysql|postgres|oracle|mongo|redis|cassandra|couchdb|elasticsearch)/],
  ["mail", /^(?:smtp|submission|pop3|imap)/],
  ["ot", /^(?:mbap|modbus|iso-tsap|s7|dnp|enip|ethernetip|bacnet|iec-104|opc)/],
];

/** Ports whose service is told by the port, whatever nmap named it or if it named none. */
const PORTS: Partial<Record<number, ServiceKind>> = {
  80: "web",
  443: "web",
  8000: "web",
  8080: "web",
  8443: "web",
  8888: "web",
  135: "smb",
  139: "smb",
  445: "smb",
  53: "directory",
  88: "directory",
  389: "directory",
  464: "directory",
  636: "directory",
  3268: "directory",
  3269: "directory",
  22: "remote",
  23: "remote",
  3389: "remote",
  5900: "remote",
  5985: "remote",
  5986: "remote",
  1433: "database",
  1521: "database",
  3306: "database",
  5432: "database",
  6379: "database",
  27017: "database",
  25: "mail",
  110: "mail",
  143: "mail",
  465: "mail",
  587: "mail",
  993: "mail",
  995: "mail",
  102: "ot",
  502: "ot",
  20000: "ot",
  44818: "ot",
  47808: "ot",
};

/** WinRM answers as plain HTTP, so its ports win over the name. */
const BY_PORT_FIRST = new Set([5985, 5986]);

export function serviceKindOf(key: string, name: string): ServiceKind {
  const { port } = parseServiceKey(key);
  if (BY_PORT_FIRST.has(port)) return PORTS[port]!;
  const bare = name
    .trim()
    .toLowerCase()
    .replace(/^ssl\//, "");
  const named = bare && NAMES.find(([, pattern]) => pattern.test(bare));
  return named ? named[0] : (PORTS[port] ?? "other");
}

/** The URL a web tool takes for the service, HTTPS when the name or port says TLS. */
export function serviceUrl(ip: string, key: string, name: string) {
  const { port } = parseServiceKey(key);
  const tls = /https|ssl/.test(name.toLowerCase()) || port === 443 || port === 8443;
  return `${tls ? "https" : "http"}://${ip}:${port}`;
}
