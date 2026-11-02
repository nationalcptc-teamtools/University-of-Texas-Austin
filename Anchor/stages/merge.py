#!/usr/bin/env python3
"""Anchor report merge (stdlib only).

Reads raw stage output -- nuclei JSON, nmap XML, NetExec SMB output, and the AD
fixtures (certipy / secretsdump) -- and writes:
  40-report/findings.jsonl   one record per deduped finding
  40-report/hosts.jsonl      one record per host
  40-report/summary.md       ranked, deduped, loot in the clear

Finding id = sha1(type). The same finding type across many hosts collapses to one
record with a hosts[] list and a count. Sort: severity then confidence.
Loot (creds / hashes / tickets) is never masked.

Importable: the loaders and dedup/sort are plain functions (see tests/test_merge.py).
"""
import os
import re
import sys
import glob
import json
import hashlib
import xml.etree.ElementTree as ET
from urllib.parse import urlsplit

SEV = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
CONF = {"high": 0, "medium": 1, "low": 2}


def host_of(entry):
    """Host identity for a nuclei finding: prefer ip, else the host/matched-at netloc."""
    if entry.get("ip"):
        return entry["ip"]
    h = entry.get("host") or entry.get("matched-at") or entry.get("matched") or ""
    if "://" in h:
        return urlsplit(h).hostname or h
    return h.split(":")[0]


# ---- attack-surface + unusual/new-port tasks (from the deep scan + httpx) -----
# A website (httpx says it speaks HTTP, or nmap tagged it so) always becomes a task.
WEB_SERVICES = {"http", "https", "http-proxy", "http-alt", "https-alt", "ssl/http", "ssl/https",
                "sun-answerbook"}
# Notable network services worth a task each -> (severity, short label). Deliberately excludes
# ubiquitous AD/infra (kerberos, ldap, dns, rpc, ntp, netbios-ns) so DCs don't flood the queue.
SURFACE_SERVICES = {
    "telnet": ("medium", "telnet"), "ftp": ("medium", "ftp"), "ftp-data": ("medium", "ftp"),
    "tftp": ("medium", "tftp"), "rsh": ("medium", "rsh"), "shell": ("medium", "rsh"),
    "rlogin": ("medium", "rlogin"), "login": ("medium", "rlogin"), "exec": ("medium", "rexec"),
    "vnc": ("medium", "vnc"), "vnc-http": ("medium", "vnc"), "x11": ("medium", "x11"),
    "snmp": ("medium", "snmp"), "pop3": ("medium", "pop3"), "imap": ("medium", "imap"),
    "smtp": ("info", "smtp"), "ssh": ("info", "ssh"),
    "ms-wbt-server": ("info", "rdp"), "rdp": ("info", "rdp"),
    "microsoft-ds": ("info", "smb"), "netbios-ssn": ("info", "smb"), "smb": ("info", "smb"),
    "winrm": ("info", "winrm"), "wsman": ("info", "winrm"),
    "nfs": ("info", "nfs"), "mountd": ("info", "nfs"),
    "mysql": ("info", "mysql"), "ms-sql-s": ("info", "mssql"), "postgresql": ("info", "postgres"),
    "oracle-tns": ("info", "oracle"), "redis": ("info", "redis"), "mongodb": ("info", "mongodb"),
    "memcached": ("info", "memcached"), "elasticsearch": ("info", "elasticsearch"),
    "docker": ("medium", "docker-api"),
}
# Ports expected on a normal network -> a non-web/non-surface port is only tasked when it's NOT here
# (uncommon) OR it's newly open since the last run.
COMMON_PORTS = {20, 21, 22, 23, 25, 53, 67, 68, 69, 80, 88, 110, 111, 123, 135, 137, 138, 139, 143,
                161, 162, 179, 389, 443, 445, 464, 465, 500, 514, 515, 543, 544, 548, 587, 593, 631,
                636, 873, 993, 995, 1025, 1433, 1521, 2049, 3268, 3269, 3306, 3389, 5060, 5222, 5432,
                5900, 5985, 5986, 8000, 8080, 8443, 8888}


def load_httpx(path):
    """httpx JSONL (stage 10) -> {(ip, 'port'): {url,title,webserver,tech,status}} for web tasks."""
    sites = {}
    if not path or not os.path.exists(path):
        return sites
    for line in open(path, encoding="utf-8", errors="replace"):
        line = line.strip()
        if not line:
            continue
        try:
            e = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(e, dict):
            continue
        host, port = str(e.get("host") or ""), str(e.get("port") or "")
        if host and port:
            sites[(host, port)] = {"url": e.get("url", ""), "title": e.get("title", ""),
                                   "webserver": e.get("webserver", ""), "tech": e.get("tech") or [],
                                   "status": e.get("status_code", "")}
    return sites


def _prior_ports(out):
    """{ip: set('port/proto')} from the most-recent OTHER run of this scope -- for 'new port' detection."""
    scope = os.path.dirname(os.path.abspath(out))
    cur = os.path.basename(os.path.abspath(out))
    cand = []
    for h in glob.glob(os.path.join(scope, "*", "40-report", "hosts.jsonl")):
        rundir = os.path.basename(os.path.dirname(os.path.dirname(h)))
        if rundir != cur:
            cand.append((os.path.getmtime(h), h))
    if not cand:
        return {}
    prior = {}
    for line in open(max(cand)[1], encoding="utf-8", errors="replace"):
        line = line.strip()
        if not line:
            continue
        try:
            h = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(h, dict) and h.get("ip"):
            prior[h["ip"]] = {"%s/%s" % (p.get("port"), p.get("proto", "tcp")) for p in h.get("ports", [])}
    return prior


def _detail(lines):
    return "\n".join(x for x in lines if x)


def load_attack_surface(hosts, httpx, prior):
    """One task per website, per notable service, and per uncommon/newly-open port. Each carries a
    descriptive title (service/site + ip:port) and the nmap/httpx detail as its description."""
    findings = []
    for ip in sorted(hosts):
        for p in hosts[ip].get("ports", []):
            port, proto = p.get("port"), (p.get("proto") or "tcp")
            if port is None:
                continue
            svc = (p.get("service") or "").lower()
            svcver = " ".join(x for x in (p.get("product"), p.get("version")) if x).strip()
            where = "%s:%s/%s" % (ip, port, proto)
            is_new = bool(prior) and ("%s/%s" % (port, proto)) not in prior.get(ip, set())
            if (ip, str(port)) in httpx or svc in WEB_SERVICES:
                s = httpx.get((ip, str(port)), {})
                name = s.get("title") or p.get("product") or "http"
                findings.append({
                    "type": "web:%s:%s" % (ip, port), "severity": "info", "confidence": "high",
                    "source": "deepscan", "host": ip,
                    "title": "web · %s · %s:%s" % (name, ip, port),
                    "detail": _detail(["A live web service is responding on this host (flagged as an attack surface).",
                                       "%s  %s" % (where, (svc or "http") + ((" " + svcver) if svcver else "")),
                                       ("URL: " + s["url"]) if s.get("url") else "",
                                       ("title: " + s["title"]) if s.get("title") else "",
                                       ("server: " + s["webserver"]) if s.get("webserver") else "",
                                       ("tech: " + ", ".join(s["tech"])) if s.get("tech") else "",
                                       ("status: %s" % s["status"]) if s.get("status") else ""])})
            elif svc in SURFACE_SERVICES:
                sev, label = SURFACE_SERVICES[svc]
                findings.append({
                    "type": "surface:%s:%s/%s" % (ip, port, proto), "severity": sev, "confidence": "high",
                    "source": "deepscan", "host": ip,
                    "title": "%s open · %s:%s/%s" % (label, ip, port, proto),
                    "detail": _detail(["A %s service is exposed on this host — a notable attack surface%s." % (
                                           label, ", newly open since the last run" if is_new else ""),
                                       "%s  %s" % (where, svc + ((" " + svcver) if svcver else "")),
                                       ("product: " + svcver) if svcver else ""])})
            elif (port not in COMMON_PORTS) or is_new:
                reason = "newly opened since last run" if is_new else "non-standard port"
                findings.append({
                    "type": "openport:%s:%s/%s" % (ip, port, proto), "severity": "info", "confidence": "medium",
                    "source": "deepscan", "host": ip,
                    "title": "unusual/new port open · %s:%s/%s%s" % (ip, port, proto,
                             (" (" + svc + ")") if svc else ""),
                    "detail": _detail(["Flagged because this port is %s." % reason,
                                       "%s  %s" % (where, (svc or "unknown service") + ((" " + svcver) if svcver else "")),
                                       ("product: " + svcver) if svcver else ""])})
    return findings


def load_nuclei(path):
    """Parse nuclei output (a JSON array from -je, or JSONL) into normalized findings."""
    out = []
    if not path or not os.path.exists(path):
        return out
    text = open(path, encoding="utf-8", errors="replace").read().strip()
    if not text:
        return out
    entries = []
    try:
        data = json.loads(text)
        entries = data if isinstance(data, list) else [data]
    except json.JSONDecodeError:
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    for e in entries:
        info = e.get("info", {}) or {}
        out.append({
            "type": e.get("template-id") or e.get("templateID") or e.get("template") or "unknown",
            "severity": (info.get("severity") or "info").lower(),
            "confidence": "high",            # a nuclei matcher hit is a positive match
            "source": "nuclei",
            "host": host_of(e),
        })
    return out


def load_nmap(path):
    """Parse an nmap -oX XML file into {ip: host record}."""
    hosts = {}
    if not path or not os.path.exists(path):
        return hosts
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError:
        return hosts
    for h in root.findall("host"):
        ip = ""
        for a in h.findall("address"):
            if a.get("addrtype") in ("ipv4", "ipv6"):
                ip = a.get("addr")
        if not ip:
            continue
        hn = ""
        hns = h.find("hostnames")
        if hns is not None and hns.find("hostname") is not None:
            hn = hns.find("hostname").get("name", "")
        osname = ""
        osel = h.find("os")
        if osel is not None and osel.find("osmatch") is not None:
            osname = osel.find("osmatch").get("name", "")
        ports = []
        pel = h.find("ports")
        if pel is not None:
            for p in pel.findall("port"):
                st = p.find("state")
                if st is None or st.get("state") != "open":
                    continue
                svc = p.find("service")
                ports.append({
                    "port": int(p.get("portid")),
                    "proto": p.get("protocol", "tcp"),
                    "service": (svc.get("name") if svc is not None else "") or "",
                    "product": (svc.get("product") if svc is not None else "") or "",
                    "version": (svc.get("version") if svc is not None else "") or "",
                })
        hosts[ip] = {"ip": ip, "hostname": hn, "os": osname, "ports": ports,
                     "commands": [], "findings": []}
    return hosts


def load_nxc(path):
    """Parse NetExec SMB text output into ({ip: host}, [findings])."""
    hosts, findings = {}, []
    if not path or not os.path.exists(path):
        return hosts, findings
    for line in open(path, encoding="utf-8", errors="replace"):
        m = re.match(r"\s*SMB\s+(\S+)\s+\d+\s+(\S+)\s+(.*)", line)
        if not m:
            continue
        ip, name, rest = m.group(1), m.group(2), m.group(3)
        domain = re.search(r"\(domain:([^)]*)\)", rest)
        signing = re.search(r"\(signing:([^)]*)\)", rest)
        smbv1 = re.search(r"\(SMBv1:([^)]*)\)", rest)
        osm = re.search(r"\[\*\]\s*(.+?)\s*\(name:", rest)
        hosts[ip] = {
            "ip": ip, "hostname": name,
            "os": osm.group(1) if osm else "",
            "domain": domain.group(1) if domain else "",
            "ports": [{"port": 445, "proto": "tcp", "service": "smb", "product": "", "version": ""}],
            "commands": [], "findings": [],
        }
        if signing and signing.group(1).lower() == "false":
            findings.append({"type": "smb-signing-not-required", "severity": "medium",
                             "confidence": "high", "source": "netexec", "host": ip})
        if smbv1 and smbv1.group(1).lower() == "true":
            findings.append({"type": "smbv1-enabled", "severity": "low",
                             "confidence": "high", "source": "netexec", "host": ip})
    return hosts, findings


def load_ad(directory):
    """Parse the AD loot dir (certipy.txt, secretsdump.txt) into ([findings], [loot lines])."""
    findings, loot = [], []
    if not directory:
        return findings, loot
    cp = os.path.join(directory, "certipy.txt")
    if os.path.exists(cp):
        txt = open(cp, encoding="utf-8", errors="replace").read()
        dns = re.search(r"DNS Name\s*:\s*(\S+)", txt)
        host = dns.group(1) if dns else "adcs"
        for esc in sorted(set(re.findall(r"\bESC(\d+)\b", txt)), key=int):
            findings.append({"type": "adcs-esc" + esc, "severity": "critical",
                             "confidence": "high", "source": "certipy", "host": host})
    sd = os.path.join(directory, "secretsdump.txt")
    if os.path.exists(sd):
        creds = 0
        for line in open(sd, encoding="utf-8", errors="replace"):
            s = line.strip()
            # A real dump line is `principal:secret` (pwdump `user:rid:lm:nt:::`, a kerberos key,
            # or `DOMAIN\user:cleartext`) -- principal has no spaces, so a ':' follows non-space.
            # The old "any non-[*]/[-]/[+] line" rule counted Impacket's banner as a credential and
            # fabricated a critical `credentials-dumped` when secretsdump was actually access-denied.
            if not re.match(r"^\S+:\S", s):
                continue
            loot.append(s)          # verbatim, cleartext
            creds += 1
        if creds:
            findings.append({"type": "credentials-dumped", "severity": "critical",
                             "confidence": "high", "source": "secretsdump", "host": "domain"})
    # Roastable hashes (ad-auth's unauth/authed Kerberos loot): each is an offline-crackable account.
    # They land in raw/{asrep,kerberoast}roast files -- surface them as findings + loot, or the real
    # win (an AS-REP hash we can crack) never reaches the report.
    for fn, ftype in (("asreproast.txt", "asrep-roastable"), ("kerberoast.txt", "kerberoastable")):
        fp = os.path.join(directory, fn)
        if not os.path.exists(fp):
            continue
        hits = 0
        for line in open(fp, encoding="utf-8", errors="replace"):
            s = line.strip()
            if s.startswith("$krb5"):          # $krb5asrep$... / $krb5tgs$...
                loot.append(s)                 # the crackable hash, cleartext
                hits += 1
        if hits:
            findings.append({"type": ftype, "severity": "high", "confidence": "high",
                             "source": "netexec", "host": "domain"})
    return findings, loot


RK_SEV = {"CRITICAL": "critical", "HIGH": "high", "MEDIUM": "medium", "LOW": "low"}


def load_relayking(directory):
    """Parse RelayKing's JSON (50-relay/relayking.json) into NTLM-relay findings. Each relay_path is a
    source->dest opportunity; the dest is the relayable target. ADCS/SCCM relay targets are high value."""
    findings = []
    p = os.path.join(directory, "relayking.json")
    if not os.path.exists(p):
        return findings
    try:
        d = json.load(open(p, encoding="utf-8", errors="replace"))
    except (json.JSONDecodeError, OSError):
        return findings
    for rp in d.get("relay_paths", []) or []:
        imp = rp.get("impact")
        imp = imp.get("value") if isinstance(imp, dict) else imp
        dest = rp.get("dest_host") or next(iter(rp.get("dest_ips") or []), "domain")
        proto = (rp.get("dest_protocol") or "ntlm").lower()
        findings.append({"type": "ntlm-relay-" + proto, "severity": RK_SEV.get(str(imp).upper(), "medium"),
                         "confidence": "high", "source": "relayking", "host": dest})
    hvt = d.get("high_value_targets", {}) or {}
    for h in hvt.get("adcs", []) or []:
        findings.append({"type": "adcs-relay-target", "severity": "high", "confidence": "high",
                         "source": "relayking", "host": h})
    for h in hvt.get("sccm", []) or []:
        findings.append({"type": "sccm-relay-target", "severity": "high", "confidence": "high",
                         "source": "relayking", "host": h})
    return findings


def dedup_findings(raw):
    """Group findings by type across hosts into one record each (hosts[], count, sha1 id)."""
    groups = {}
    for f in raw:
        t = f["type"]
        g = groups.get(t)
        if g is None:
            groups[t] = g = {"severity": f["severity"], "confidence": f.get("confidence", "high"),
                             "source": f.get("source", ""), "hosts": set(),
                             "title": f.get("title", ""), "detail": f.get("detail", "")}
        elif SEV.get(f["severity"], 9) < SEV.get(g["severity"], 9):
            g["severity"] = f["severity"]     # keep the worst severity seen for this type
        if f.get("host"):
            g["hosts"].add(f["host"])
    records = []
    for t, g in groups.items():
        hosts = sorted(g["hosts"])
        # id is the TYPE only, not the host set: findings are grouped by type, so the host list is a
        # mutable fact. Hashing hosts in made the id change every time a finding was seen on one more
        # host, orphaning the team's triage overlay (status/assignee/notes) on a now-invisible id.
        fid = hashlib.sha1(t.encode()).hexdigest()
        rec = {"id": fid, "type": t, "severity": g["severity"],
               "confidence": g["confidence"], "source": g["source"],
               "hosts": hosts, "count": len(hosts), "status": "open"}
        if g.get("title"):
            rec["title"] = g["title"]
        if g.get("detail"):
            rec["detail"] = g["detail"]
        records.append(rec)
    return records


def sort_findings(records):
    """Severity (critical first) then confidence (high first)."""
    return sorted(records, key=lambda r: (SEV.get(r["severity"], 9), CONF.get(r["confidence"], 9)))


def merge_hosts(a, b):
    """Union two {ip: host} maps; fill empty fields and merge port lists."""
    out = {ip: dict(h) for ip, h in a.items()}
    for ip, h in b.items():
        if ip not in out:
            out[ip] = dict(h)
            continue
        for k, v in h.items():
            if v and not out[ip].get(k):
                out[ip][k] = v
        seen = {(p["port"], p["proto"]) for p in out[ip].get("ports", [])}
        for p in h.get("ports", []):
            if (p["port"], p["proto"]) not in seen:
                out[ip].setdefault("ports", []).append(p)
    return out


def link_findings(records, hosts):
    for r in records:
        for ip in r["hosts"]:
            if ip in hosts:
                hosts[ip]["findings"].append(r["id"])


def load_status(path):
    """Read the status.jsonl ledger (one tool run per line) written by _lib.sh record()."""
    rows = []
    if not path or not os.path.exists(path):
        return rows
    for line in open(path, encoding="utf-8", errors="replace"):
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return rows


# statuses worth surfacing; ok/empty are not problems
HEALTH_PROBLEM = ("failed", "timeout", "skipped")


def render_health(status):
    """Markdown lines for '## Scan health' -- the tools that failed, timed out, or were skipped."""
    probs = [s for s in status if s.get("status") in HEALTH_PROBLEM]
    L = ["", "## Scan health", ""]
    if not probs:
        L.append("All scans ok.")
        return L
    L += ["| Stage | Tool | Status | Reason |", "| --- | --- | --- | --- |"]
    for s in probs:
        L.append("| %s | %s | %s | %s |" % (s.get("stage", ""), s.get("tool", ""),
                                            s.get("status", ""), s.get("message", "")))
    return L


def render_summary(records, hosts, loot, status=None):
    L = ["# Anchor summary", "",
         "%d findings (deduped) across %d hosts." % (len(records), len(hosts)),
         "Each line is a lead to verify and screenshot, not a confirmed finding.", "",
         "## Findings", "",
         "| Sev | Conf | Finding | Hosts | Source |",
         "| --- | --- | --- | --- | --- |"]
    for r in records:
        hs = ", ".join(r["hosts"]) or "-"
        if r["count"] > 1:
            hs += " (%d)" % r["count"]
        L.append("| %s | %s | %s | %s | %s |" % (r["severity"], r["confidence"], r["type"], hs, r["source"]))
    if loot:
        L += ["", "## Loot (cleartext)", "", "```"] + loot + ["```"]
    L += ["", "## Hosts", "", "| IP | Host | OS | Open ports |", "| --- | --- | --- | --- |"]
    for h in hosts.values():
        ports = ", ".join(str(p["port"]) for p in h.get("ports", []))
        L.append("| %s | %s | %s | %s |" % (h["ip"], h.get("hostname", ""), h.get("os", ""), ports))
    L += render_health(status or [])
    return "\n".join(L) + "\n"


def write_jsonl(path, rows):
    with open(path, "w", encoding="utf-8") as fh:
        for r in rows:
            fh.write(json.dumps(r) + "\n")


def atomic_write(path, text):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(text + ("\n" if text else ""))
    os.replace(tmp, path)


# Which open ports to feed httpx as web candidates. nmap often misfingerprints a web app on an
# odd port (juice-shop on 3000 comes back as "ppp"), so pass every open TCP port EXCEPT clearly
# non-web services and let httpx decide what actually speaks HTTP (the design's real filter).
NON_WEB_SVC = {"ssh", "domain", "smb", "microsoft-ds", "netbios-ssn", "netbios-ns",
               "ms-wbt-server", "rdp", "ftp", "ftp-data", "telnet", "smtp", "submission",
               "pop3", "imap", "ldap", "ldaps", "kerberos-sec", "msrpc", "mysql",
               "ms-sql-s", "rpcbind", "snmp", "vnc"}


def emit_discovery(xml, disc_dir):
    """From an nmap XML, write hosts.txt (live IPs) and web-targets.txt (ip:port for web services)."""
    hosts = load_nmap(xml)
    ips, web = set(), set()
    for ip, h in hosts.items():
        ips.add(ip)
        for p in h["ports"]:
            if p["proto"] == "tcp" and p["service"] not in NON_WEB_SVC:
                web.add("%s:%d" % (ip, p["port"]))
    atomic_write(os.path.join(disc_dir, "hosts.txt"), "\n".join(sorted(ips)))
    atomic_write(os.path.join(disc_dir, "web-targets.txt"), "\n".join(sorted(web)))
    return len(ips), len(web)


def build(out):
    """Read an engagement run dir's raw output and write the 40-report artifacts."""
    disc = os.path.join(out, "00-discovery")
    raw = []
    # nuclei.json is written once, at the end of the vuln stage. Also read the streaming raw JSONL the
    # scan appends live, so nuclei findings show on the site AS they're found, not only when vuln finishes.
    # dedup_findings groups by type (host set is a union), so the overlap once nuclei.json lands is free.
    raw += load_nuclei(os.path.join(out, "30-vuln", "nuclei.json"))
    for _jl in ("nuclei-tags.jsonl", "nuclei-rest.jsonl"):
        raw += load_nuclei(os.path.join(out, "30-vuln", "raw", _jl))
    nmap_xml = next(iter(sorted(glob.glob(os.path.join(disc, "raw", "*.xml")))), None)
    nmap_hosts = load_nmap(nmap_xml)
    # fold in the deep pass (full TCP + UDP) so the full port inventory feeds the host records AND the
    # attack-surface generator; merge_hosts unions ports per ip.
    for deep_xml in sorted(glob.glob(os.path.join(out, "60-deep", "raw", "nmap-*.xml"))):
        nmap_hosts = merge_hosts(nmap_hosts, load_nmap(deep_xml))
    nxc_hosts, nxc_find = load_nxc(os.path.join(disc, "raw", "nxc-smb.txt"))
    raw += nxc_find
    ad_find, loot = load_ad(os.path.join(out, "20-ad", "raw"))
    raw += ad_find
    raw += load_relayking(os.path.join(out, "50-relay"))
    hosts = merge_hosts(nmap_hosts, nxc_hosts)
    # one task per website / notable service / uncommon-or-new port, from the full inventory + httpx
    raw += load_attack_surface(hosts, load_httpx(os.path.join(out, "10-web", "raw", "httpx.jsonl")),
                               _prior_ports(out))
    records = sort_findings(dedup_findings(raw))
    link_findings(records, hosts)
    status = load_status(os.path.join(out, "status.jsonl"))
    rep = os.path.join(out, "40-report")
    os.makedirs(rep, exist_ok=True)
    write_jsonl(os.path.join(rep, "findings.jsonl"), records)
    write_jsonl(os.path.join(rep, "hosts.jsonl"), list(hosts.values()))
    with open(os.path.join(rep, "summary.md"), "w", encoding="utf-8") as fh:
        fh.write(render_summary(records, hosts, loot, status))
    return records, hosts


if __name__ == "__main__":
    # discovery subcommand: python3 merge.py discovery <nmap.xml> <00-discovery dir>
    if len(sys.argv) >= 4 and sys.argv[1] == "discovery":
        n_ips, n_web = emit_discovery(sys.argv[2], sys.argv[3])
        print("discovery: %d hosts, %d web targets" % (n_ips, n_web))
    else:
        out = sys.argv[1] if len(sys.argv) > 1 else "."
        recs, hs = build(out)
        print("merged %d findings across %d hosts -> %s/40-report/" % (len(recs), len(hs), out))
