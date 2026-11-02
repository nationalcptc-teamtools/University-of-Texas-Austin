import { expect, it } from "vite-plus/test";
import { parseNmapXml } from "./nmap.ts";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<nmaprun scanner="nmap" args="nmap -sV -O -oX scan.xml 10.0.0.0/29" start="1700000000" version="7.94">
  <host starttime="1" endtime="2">
    <status state="up" reason="echo-reply"/>
    <address addr="10.0.0.23" addrtype="ipv4"/>
    <address addr="00:0C:29:AA:BB:CC" addrtype="mac" vendor="VMware"/>
    <hostnames>
      <hostname name="dc01.corp.local" type="PTR"/>
      <hostname name="dc01" type="user"/>
    </hostnames>
    <ports>
      <extraports state="closed" count="995"/>
      <port protocol="tcp" portid="88"><state state="open"/><service name="kerberos-sec" product="Microsoft Windows Kerberos" method="probed"/></port>
      <port protocol="tcp" portid="445"><state state="open"/><service name="microsoft-ds" method="table"/></port>
      <port protocol="tcp" portid="3389"><state state="open"/><service name="ms-wbt-server" product="Microsoft Terminal Services" version="10.0" method="probed"/></port>
      <port protocol="tcp" portid="23"><state state="closed"/><service name="telnet"/></port>
      <port protocol="tcp" portid="135"><state state="filtered"/><service name="msrpc"/></port>
      <port protocol="udp" portid="53"><state state="open"/><service name="domain" product="Simple DNS Plus"/></port>
    </ports>
    <os>
      <osmatch name="Microsoft Windows Server 2019" accuracy="100"/>
      <osmatch name="Microsoft Windows 10 1909" accuracy="90"/>
    </os>
  </host>
  <host>
    <status state="down" reason="no-response"/>
    <address addr="10.0.0.24" addrtype="ipv4"/>
  </host>
  <host>
    <status state="up" reason="syn-ack"/>
    <address addr="10.0.0.31" addrtype="ipv4"/>
    <hostnames/>
    <ports>
      <port protocol="tcp" portid="22"><state state="open"/><service name="ssh" product="OpenSSH" version="9.2p1 Debian"/></port>
      <port protocol="sctp" portid="5060"><state state="open"/><service name="sip"/></port>
    </ports>
  </host>
</nmaprun>`;

it("reads the hosts that are up with their open ports", () => {
  expect(parseNmapXml(XML)).toEqual([
    {
      ip: "10.0.0.23",
      hostname: "dc01",
      os: "Microsoft Windows Server 2019",
      services: {
        "88/tcp": { name: "kerberos-sec", product: "Microsoft Windows Kerberos" },
        "445/tcp": { name: "microsoft-ds", product: "" },
        "3389/tcp": { name: "ms-wbt-server", product: "Microsoft Terminal Services 10.0" },
        "53/udp": { name: "domain", product: "Simple DNS Plus" },
      },
    },
    {
      ip: "10.0.0.31",
      hostname: "",
      os: "",
      services: { "22/tcp": { name: "ssh", product: "OpenSSH 9.2p1 Debian" } },
    },
  ]);
});

it("falls back to the IPv6 address and the PTR name", () => {
  const [host] = parseNmapXml(`<nmaprun><host><status state="up"/>
    <address addr="fe80::1" addrtype="ipv6"/>
    <hostnames><hostname name="router.lan" type="PTR"/></hostnames></host></nmaprun>`);
  expect(host).toMatchObject({ ip: "fe80::1", hostname: "router.lan" });
});

it("cuts long text to the length a field allows", () => {
  const [host] = parseNmapXml(`<nmaprun><host><status state="up"/>
    <address addr="10.0.0.1" addrtype="ipv4"/>
    <hostnames><hostname name="${"a".repeat(600)}" type="user"/></hostnames></host></nmaprun>`);
  expect(host!.hostname).toHaveLength(500);
});

it("rejects input that is not an nmap file", () => {
  expect(() => parseNmapXml("<html><body>hi</body></html>")).toThrow(/nmap XML/);
  expect(() => parseNmapXml("10.0.0.1 open 22/tcp")).toThrow(/nmap XML/);
  expect(() => parseNmapXml("<nmaprun><host></nmaprun>")).toThrow(/nmap XML/);
});
