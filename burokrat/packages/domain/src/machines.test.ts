import { expect, it } from "vite-plus/test";
import { SERVICE_KEY, type MachineEntry } from "./content.ts";
import { matchesFilter, parseFilter, toggleTerm } from "./filter.ts";
import { serviceKindOf, serviceUrl } from "./service-kinds.ts";
import { compareIps, compareServiceKeys, parseHosts } from "./machines.ts";

it("reads addresses from a list, a hosts file or a scan line, once each", () => {
  const text = [
    "10.0.0.23\tdc01.corp.local",
    "10.0.0.31 web01",
    "Nmap scan report for 10.0.0.40",
    "10.0.0.23, 10.0.0.41",
    "not an address: 10.0.0.256 or 1.2.3.4.5",
  ].join("\n");
  expect(parseHosts(text)).toEqual([
    { ip: "10.0.0.23", hostname: "dc01.corp.local" },
    { ip: "10.0.0.31", hostname: "web01" },
    { ip: "10.0.0.40", hostname: "" },
    { ip: "10.0.0.41", hostname: "" },
  ]);
});

it("orders addresses by value, then anything else", () => {
  expect(["10.0.0.100", "web", "10.0.0.9", "10.0.1.1"].sort(compareIps)).toEqual([
    "10.0.0.9",
    "10.0.0.100",
    "10.0.1.1",
    "web",
  ]);
});

it("keys services by a real port and protocol", () => {
  expect(["445/tcp", "65535/udp", "1/tcp"].every((key) => SERVICE_KEY.test(key))).toBe(true);
  expect(
    ["0/tcp", "65536/tcp", "445/TCP", "445", "080/tcp"].some((key) => SERVICE_KEY.test(key)),
  ).toBe(false);
  expect(["445/tcp", "53/udp", "53/tcp", "8080/tcp"].sort(compareServiceKeys)).toEqual([
    "53/tcp",
    "53/udp",
    "445/tcp",
    "8080/tcp",
  ]);
});

it("filters machines by terms and text, keeping out-of-scope ones out unless asked", () => {
  const machine = (fields: Partial<MachineEntry>): MachineEntry => ({
    ip: "10.0.0.1",
    hostname: "",
    os: "",
    status: "untouched",
    scope: "in",
    scopeNote: "",
    claimedAt: 0,
    services: {},
    notes: "",
    owner: "",
    createdBy: "Alice",
    createdAt: 0,
    deleted: false,
    ...fields,
  });
  const dc = machine({
    ip: "10.0.0.23",
    hostname: "dc01",
    os: "Windows Server 2019",
    status: "foothold",
    owner: "Alice",
    services: { "445/tcp": { name: "microsoft-ds", product: "", note: "" } },
  });
  const web = machine({
    ip: "10.0.0.31",
    status: "progress",
    services: { "80/tcp": { name: "http", product: "nginx", note: "" } },
  });
  const printer = machine({ ip: "10.0.0.99", scope: "out" });
  const shown = (query: string) =>
    [dc, web, printer]
      .filter((each) => matchesFilter(each, parseFilter(query), "Alice"))
      .map((each) => each.ip);

  expect(shown("")).toEqual(["10.0.0.23", "10.0.0.31"]);
  expect(shown("status:foothold status:progress")).toEqual(["10.0.0.23", "10.0.0.31"]);
  expect(shown("status:in-progress port:80")).toEqual(["10.0.0.31"]);
  expect(shown("owner:me os:windows")).toEqual(["10.0.0.23"]);
  expect(shown("nginx")).toEqual(["10.0.0.31"]);
  expect(shown("scope:out")).toEqual(["10.0.0.99"]);
  expect(shown("http://x")).toEqual([]);
  expect(toggleTerm("dc owner:me", "owner", "me")).toBe("dc");
  expect(toggleTerm("dc", "status", "owned")).toBe("dc status:owned");
});

it("sorts services into kinds by name, then port, and writes web ones as URLs", () => {
  expect(
    [
      ["445/tcp", "microsoft-ds"],
      ["8080/tcp", "http-proxy"],
      ["5985/tcp", "http"],
      ["88/tcp", "kerberos-sec"],
      ["1433/tcp", ""],
      ["502/tcp", "mbap"],
      ["9999/tcp", "abyss"],
    ].map(([key, name]) => serviceKindOf(key!, name!)),
  ).toEqual(["smb", "web", "remote", "directory", "database", "ot", "other"]);
  expect(serviceUrl("10.0.0.5", "8443/tcp", "")).toBe("https://10.0.0.5:8443");
  expect(serviceUrl("10.0.0.5", "8000/tcp", "http")).toBe("http://10.0.0.5:8000");
  expect(serviceUrl("10.0.0.5", "4443/tcp", "ssl/http")).toBe("https://10.0.0.5:4443");
});
