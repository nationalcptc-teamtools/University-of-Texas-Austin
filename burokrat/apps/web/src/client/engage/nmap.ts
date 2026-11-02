import { serviceKeyOf, type ScannedHost } from "@burokrat/domain";

const MAX_LENGTH = 500;

const clip = (text: string | null | undefined) => (text ?? "").trim().slice(0, MAX_LENGTH);

const children = (parent: Element, tag: string) =>
  [...parent.children].filter((child) => child.tagName === tag);

const ipOf = (host: Element) => {
  const addresses = children(host, "address");
  const address =
    addresses.find((a) => a.getAttribute("addrtype") === "ipv4") ??
    addresses.find((a) => a.getAttribute("addrtype") === "ipv6");
  return clip(address?.getAttribute("addr"));
};

/** The user-given name, else the reverse DNS one, else the first. */
function hostnameOf(host: Element) {
  const names = children(host, "hostnames").flatMap((list) => children(list, "hostname"));
  const named = (type: string) => names.find((name) => name.getAttribute("type") === type);
  return clip((named("user") ?? named("PTR") ?? names[0])?.getAttribute("name"));
}

/** The best guess, as nmap lists the most accurate match first. */
const osOf = (host: Element) =>
  clip(
    children(host, "os")
      .flatMap((os) => children(os, "osmatch"))[0]
      ?.getAttribute("name"),
  );

function servicesOf(host: Element): ScannedHost["services"] {
  const services: ScannedHost["services"] = {};
  for (const port of children(host, "ports").flatMap((ports) => children(ports, "port"))) {
    const protocol = port.getAttribute("protocol");
    const portId = Number(port.getAttribute("portid"));
    const open = children(port, "state")[0]?.getAttribute("state") === "open";
    if (!open || (protocol !== "tcp" && protocol !== "udp") || !Number.isInteger(portId)) continue;
    const service = children(port, "service")[0];
    services[serviceKeyOf(portId, protocol)] = {
      name: clip(service?.getAttribute("name")),
      product: clip(
        `${service?.getAttribute("product") ?? ""} ${service?.getAttribute("version") ?? ""}`,
      ),
    };
  }
  return services;
}

/** The hosts that were up in an `nmap -oX` file, with the open ports they answered on. */
export function parseNmapXml(xml: string): ScannedHost[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror") || doc.documentElement.tagName !== "nmaprun")
    throw new Error("This is not an nmap XML file. Scan with -oX to make one.");
  return children(doc.documentElement, "host")
    .filter((host) => children(host, "status")[0]?.getAttribute("state") === "up")
    .map((host) => ({
      ip: ipOf(host),
      hostname: hostnameOf(host),
      os: osOf(host),
      services: servicesOf(host),
    }))
    .filter((host) => host.ip);
}
