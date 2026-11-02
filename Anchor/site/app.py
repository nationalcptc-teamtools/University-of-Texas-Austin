#!/usr/bin/env python3
"""Anchor triage site -- thin Flask API over the triage store, serves the SPA.

The scanner owns finding/host FACTS (re-ingested from 40-report); this app owns the
team's triage OVERLAY (status, assignee, notes). Loot and evidence are shown in the clear.

Boot:  ANCHOR_SCOPE=engagement/<scope> python3 site/app.py   # or: make site SCOPE=<scope>
"""
import os
import re
import sys
import csv
import io
import json
import time
import glob
import zipfile
import tempfile
import sqlite3
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET

from flask import Flask, request, jsonify, send_from_directory, abort

import ingest as ingest_mod
# merge.py (in stages/) rebuilds 40-report from whatever raw output exists -- used to refresh the
# report LIVE during a scan, so new hosts/findings appear without waiting for the final report stage.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "stages"))
try:
    import merge as merge_mod
except Exception:
    merge_mod = None

ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")
STAGES_ORDER = ["00 discovery", "10 web", "20 ad", "30 vuln", "40 report"]

HERE = os.path.dirname(os.path.abspath(__file__))
SCOPE = os.environ.get("ANCHOR_SCOPE") or "."           # engagement/<scope> dir
DB = os.environ.get("ANCHOR_DB") or os.path.join(SCOPE, "triage.db")
EVIDENCE_DIR = os.path.join(SCOPE, "triage", "evidence")
IMG_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
PORT = int(os.environ.get("ANCHOR_PORT", "8000"))
EV_CAP = 6000                                           # cap raw request/response/output per item

STATUSES = ["New", "Triaging", "Confirmed", "Dismissed", "In report"]
SEV_RANK = ("CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 "
            "WHEN 'low' THEN 3 WHEN 'info' THEN 4 ELSE 5 END")
CONF_RANK = "CASE confidence WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END"
IP_RE = re.compile(r"^\d{1,3}(\.\d{1,3}){3}$")

# One-line descriptions for the non-nuclei finding types (nuclei brings its own via info.name).
DESCRIPTIONS = {
    "smb-signing-not-required": "SMB signing is not required -- enables SMB relay to authenticate as a victim.",
    "smbv1-enabled": "Legacy SMBv1 is enabled (EternalBlue-class exposure).",
    "asrep-roastable": "Kerberos pre-auth disabled -- the AS-REP is crackable offline to recover the password.",
    "kerberoastable": "Service account with an SPN -- its TGS is crackable offline to recover the password.",
    "adcs-esc8": "AD CS Web Enrollment over HTTP -- relay NTLM to the CA for a client-auth cert (ESC8).",
    "credentials-dumped": "Credential material (hashes / secrets) was dumped from the target.",
}


def _one_sentence(text):
    """First sentence of text (nuclei descriptions can be multi-sentence/markdown), collapsed + capped."""
    t = " ".join((text or "").split())
    if not t:
        return ""
    i = t.find(". ")
    return (t[:i + 1] if i != -1 else t)[:300]


def _describe(ftype):
    """A one-sentence 'why it was tagged' for a finding type (dynamic types handled by prefix)."""
    if ftype in DESCRIPTIONS:
        return DESCRIPTIONS[ftype]
    if ftype.startswith("adcs-esc"):
        return "AD CS misconfiguration (%s) lets a low-priv user escalate via certificate abuse." % ftype.upper()
    if ftype.startswith("ntlm-relay-"):
        return "NTLM authentication can be relayed to %s here (coerce a victim, then authenticate as them)." \
            % ftype.split("ntlm-relay-", 1)[1].upper()
    if ftype == "adcs-relay-target":
        return "AD CS endpoint reachable as an NTLM-relay target to mint a client-auth certificate (ESC8-style)."
    if ftype == "sccm-relay-target":
        return "SCCM endpoint reachable as an NTLM-relay target for credential/role abuse."
    return ""
# Fallback command template per AD finding (used only if the real logged command isn't found), and a
# keyword to locate the ACTUAL command in the run's commands.jsonl so we show exactly what ran.
AD_CMD = {
    "asrep-roastable": "nxc ldap <dc> -u <user> -p <pass> --dns-tcp --asreproast asreproast.txt",
    "kerberoastable": "nxc ldap <dc> -u <user> -p <pass> --dns-tcp --kerberoasting kerberoast.txt",
    "adcs-esc8": "certipy find -u <user>@<domain> -p <pass> -dc-ip <dc> -vulnerable -stdout",
    "smb-signing-not-required": "nxc smb <host>",
    "smbv1-enabled": "nxc smb <host>",
    "credentials-dumped": "secretsdump.py <domain>/<user>:<pass>@<dc>",
}
AD_CMD_KEY = {
    "asrep-roastable": "--asreproast", "kerberoastable": "--kerberoasting",
    "adcs-esc8": "certipy find", "smb-signing-not-required": "nxc smb",
    "smbv1-enabled": "nxc smb", "credentials-dumped": "secretsdump",
}
AD_RAW = {
    "asrep-roastable": ("20-ad", "raw", "asreproast.txt"),
    "kerberoastable": ("20-ad", "raw", "kerberoast.txt"),
    "adcs-esc8": ("20-ad", "raw", "certipy.txt"),
    "credentials-dumped": ("20-ad", "raw", "secretsdump.txt"),
    "smb-signing-not-required": ("00-discovery", "raw", "nxc-smb.txt"),
    "smbv1-enabled": ("00-discovery", "raw", "nxc-smb.txt"),
}

app = Flask(__name__, static_folder=os.path.join(HERE, "static"), static_url_path="")


def db():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("PRAGMA busy_timeout=4000")
    return c


def _now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


# ---- host IP<->hostname enrichment (#3) --------------------------------------
def host_index(c):
    m = {}
    for r in c.execute("SELECT ip,hostname FROM host"):
        if r["ip"]:
            m[r["ip"]] = r["hostname"] or ""
        if r["hostname"]:
            m[r["hostname"].lower()] = r["ip"]
    return m


def host_link(h, m):
    """A host token -> {label:'ip (hostname)', ip:<machine ip or None>}. ip lets the UI jump to the
    machine record; None (e.g. 'domain') means not a clickable machine."""
    if IP_RE.match(h):
        return {"label": "%s (%s)" % (h, m[h]) if m.get(h) else h, "ip": h}
    ip = m.get(h.lower()) or m.get(h.split(".")[0].lower())   # hostname or FQDN first label
    return {"label": "%s (%s)" % (ip, h) if ip else h, "ip": ip}


def host_links(hosts, m):
    return [host_link(h, m) for h in hosts]


def label_host(h, m):
    return host_link(h, m)["label"]


def label_hosts(hosts, m):
    return [label_host(h, m) for h in hosts]


# ---- evidence (#4): read the raw tool output a finding came from -------------
def _read_jsonl(p):
    if not os.path.exists(p):
        return
    for line in open(p, encoding="utf-8", errors="replace"):
        line = line.strip()
        if line:
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(obj, dict):  # consumers call .get(); skip a stray scalar/array line
                yield obj


def _nuclei_evidence(run_dir, ftype):
    ev = []
    for fn in ("nuclei-tags.jsonl", "nuclei-rest.jsonl"):
        for e in _read_jsonl(os.path.join(run_dir, "30-vuln", "raw", fn)):
            if (e.get("template-id") or e.get("templateID")) != ftype:
                continue
            info = e.get("info", {}) or {}
            ev.append({
                "where": e.get("matched-at") or e.get("url") or e.get("host"),
                "command": e.get("curl-command"),
                "template": e.get("template") or ftype,
                "name": info.get("name"),
                "description": (info.get("description") or "").strip(),   # the template's own "what it checks"
                "reference": e.get("template-url"),
                "tags": info.get("tags"),
                "request": (e.get("request") or "")[:EV_CAP],
                "response": (e.get("response") or "")[:EV_CAP],
            })
    return ev


def _real_cmd(run_dir, keyword, fallback):
    """The actual command (from commands.jsonl) whose text contains keyword; else the template."""
    if keyword:
        for e in _read_jsonl(os.path.join(run_dir, "commands.jsonl")):
            if keyword in (e.get("cmd") or ""):
                return e["cmd"]
    return fallback


def _host_in_line(h, line):
    """Whole-token match so '10.0.0.5' doesn't also match '10.0.0.50' (or a hostname substring)."""
    return re.search(r"\b" + re.escape(h) + r"\b", line) is not None


def _ad_evidence(run_dir, ftype, hosts):
    loc = AD_RAW.get(ftype)
    if not loc:
        return []
    path = os.path.join(run_dir, *loc)
    if not os.path.exists(path):
        return []
    text = open(path, encoding="utf-8", errors="replace").read()
    # host-scoped findings: keep only the lines that mention one of the hosts
    if ftype in ("smb-signing-not-required", "smbv1-enabled") and hosts:
        text = "\n".join(l for l in text.splitlines() if any(_host_in_line(h, l) for h in hosts)) or text
    cmd = _real_cmd(run_dir, AD_CMD_KEY.get(ftype), AD_CMD.get(ftype, ""))
    return [{"where": ", ".join(hosts) if hosts else "domain", "command": cmd, "output": text[:EV_CAP]}]


def _relayking_evidence(run_dir, hosts):
    p = os.path.join(run_dir, "50-relay", "relayking.json")
    if not os.path.exists(p):
        return []
    try:
        d = json.load(open(p, encoding="utf-8", errors="replace"))
    except (json.JSONDecodeError, OSError):
        return []
    hs = set(hosts)
    lines = []
    for rp in d.get("relay_paths", []) or []:
        match = (rp.get("dest_host") in hs or rp.get("source_host") in hs
                 or set(rp.get("dest_ips") or []) & hs or set(rp.get("source_ips") or []) & hs)
        if hs and not match:
            continue
        lines.append("%s -> %s (%s): %s" % (rp.get("source_host"), rp.get("dest_host"),
                                            rp.get("dest_protocol"), rp.get("description")))
    cmd = _real_cmd(run_dir, "relayking",
                    "relayking -t <hosts> -u <user> -p <pass> --dc-ip <dc> --protocols … -o json --gen-relay-list …")
    out = "\n".join(lines) if lines else json.dumps(d.get("statistics", {}))
    return [{"where": ", ".join(hosts) if hosts else "domain", "command": cmd, "output": out[:EV_CAP]}]


def evidence_for(finding, run_dir):
    hosts = json.loads(finding["hosts_json"] or "[]")
    if finding["source"] == "nuclei":
        return _nuclei_evidence(run_dir, finding["type"])
    if finding["source"] == "relayking":
        return _relayking_evidence(run_dir, hosts)
    return _ad_evidence(run_dir, finding["type"], hosts)


def run_dir_of(finding):
    return os.path.join(SCOPE, finding["first_seen_run"] or "")


# ---- nmap evidence per host: genuine -oN block if captured, else faithful render from the XML -----
def _latest_discovery_run():
    xmls = sorted(glob.glob(os.path.join(SCOPE, "*", "00-discovery", "raw", "*.xml")))
    return os.path.dirname(os.path.dirname(os.path.dirname(xmls[-1]))) if xmls else None


def _oN_block(path, ip):
    """Pull one host's 'Nmap scan report for … ip …' block out of an nmap -oN file."""
    if not os.path.exists(path):
        return ""
    out, grab = [], False
    for line in open(path, encoding="utf-8", errors="replace"):
        if line.startswith("Nmap scan report for"):
            grab = _host_in_line(ip, line)
        if grab:
            out.append(line.rstrip("\n"))
    return "\n".join(out).strip()


def _nmap_from_xml(xml_path, ip):
    try:
        root = ET.parse(xml_path).getroot()
    except Exception:
        return ""
    for host in root.findall("host"):
        if ip not in [a.get("addr") for a in host.findall("address")]:
            continue
        names = [h.get("name") for h in host.findall("hostnames/hostname") if h.get("name")]
        hdr = "%s (%s)" % (names[0], ip) if names else ip
        L = ["Nmap scan report for %s" % hdr, "", "PORT       STATE SERVICE         VERSION"]
        for p in host.findall("ports/port"):
            st = p.find("state"); svc = p.find("service")
            state = st.get("state") if st is not None else ""
            svcname = svc.get("name") if svc is not None else ""
            ver = " ".join(x for x in [
                (svc.get("product") if svc is not None else ""),
                (svc.get("version") if svc is not None else ""),
                (svc.get("extrainfo") if svc is not None else "")] if x)
            L.append("%-10s %-5s %-15s %s" % ("%s/%s" % (p.get("portid"), p.get("protocol")), state, svcname, ver))
            for s in p.findall("script"):
                L.append("| %s:" % s.get("id"))
                for ol in (s.get("output") or "").strip().splitlines():
                    L.append("|   " + ol)
        hs = host.findall("hostscript/script")
        if hs:
            L.append("")
            L.append("Host script results:")
            for s in hs:
                L.append("| %s:" % s.get("id"))
                for ol in (s.get("output") or "").strip().splitlines():
                    L.append("|   " + ol)
        return "\n".join(L)
    return ""


def nmap_report(ip):
    run = _latest_discovery_run()
    if not run:
        return "no discovery output found for this scope."
    blk = _oN_block(os.path.join(run, "00-discovery", "raw", "nmap.normal.txt"), ip)
    if blk:
        return blk + "\n"
    xmls = sorted(glob.glob(os.path.join(run, "00-discovery", "raw", "*.xml")))
    if xmls:
        r = _nmap_from_xml(xmls[0], ip)
        if r:
            return "# reconstructed from nmap XML (this run predates captured -oN output)\n\n" + r + "\n"
    return "no nmap output for %s\n" % ip


# ---- routes ------------------------------------------------------------------
@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/api/findings")
def findings():
    c = db()
    m = host_index(c)
    rows = c.execute(
        "SELECT f.id,f.type,f.title,f.severity,f.confidence,f.source,f.hosts_json,f.count,"
        "f.first_seen_run,s.status,s.assignee,s.updated_at "
        "FROM finding f JOIN finding_state s USING(id) ORDER BY %s,%s,f.type" % (SEV_RANK, CONF_RANK)
    ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        hosts = json.loads(d.pop("hosts_json") or "[]")
        d["hosts"] = hosts
        d["name"] = d.get("title") or d["type"]   # display name: title if the generator set one, else type
        d["hosts_links"] = host_links(hosts, m)
        d["hosts_label"] = ", ".join(h["label"] for h in d["hosts_links"])
        out.append(d)
    return jsonify(out)


def finding_detail(c, r, m):
    """Build the full finding dict (facts + overlay + evidence + notes) for a joined finding row."""
    d = {k: r[k] for k in r.keys() if k != "hosts_json"}
    d["name"] = d.get("title") or r["type"]
    d["hosts"] = json.loads(r["hosts_json"] or "[]")
    d["hosts_label"] = label_hosts(d["hosts"], m)
    # a generator-supplied detail (e.g. the nmap block) is the summary; else the canned description
    # one-sentence "why it was tagged": a generator detail, else the canned description, else the nuclei
    # template's own description/name (what it checked), so every event explains itself.
    d["summary"] = (d.get("detail") or "").strip() or _describe(r["type"])
    d["evidence"] = evidence_for(r, run_dir_of(r))
    if not d["summary"] and d["evidence"]:
        ev0 = d["evidence"][0]
        d["summary"] = (_one_sentence(ev0.get("description")) or ev0.get("name")
                        or (("Matched the nuclei template %s." % ev0["template"]) if ev0.get("template") else ""))
    d["notes"] = [dict(n) for n in c.execute(
        "SELECT id,author,ts,body FROM note WHERE target_type='finding' AND target_id=? ORDER BY id", (r["id"],))]
    d["captured"] = captured_for(c, "finding", r["id"])
    return d


def captured_for(c, ttype, tid):
    return [dict(e) for e in c.execute(
        "SELECT id,kind,body,caption,author,ts FROM evidence WHERE target_type=? AND target_id=? "
        "ORDER BY id", (ttype, tid))]


def add_evidence(ttype, tid):
    """Shared: attach an uploaded screenshot (multipart 'file') or pasted text (JSON {body}) to a target."""
    c = db()
    ts = _now()
    f = request.files.get("file")
    if f and f.filename:
        ext = os.path.splitext(f.filename)[1].lower()
        ext = ext if ext in IMG_EXT else ".png"
        dd = os.path.join(EVIDENCE_DIR, ttype, tid)
        os.makedirs(dd, exist_ok=True)
        name = "%s-%d%s" % (time.strftime("%Y%m%d-%H%M%S"), int(time.time() * 1000) % 100000, ext)
        f.save(os.path.join(dd, name))
        rel = os.path.relpath(os.path.join(dd, name), SCOPE)
        c.execute("INSERT INTO evidence(target_type,target_id,kind,path,caption,author,ts) "
                  "VALUES(?,?,'image',?,?,?,?)", (ttype, tid, rel,
                  (request.form.get("caption") or "").strip(), (request.form.get("author") or "anon").strip(), ts))
    else:
        b = request.get_json(force=True, silent=True) or {}
        body = (b.get("body") or "").strip()
        if not body:
            abort(400, "empty evidence")
        c.execute("INSERT INTO evidence(target_type,target_id,kind,body,caption,author,ts) "
                  "VALUES(?,?,'text',?,?,?,?)", (ttype, tid, body,
                  (b.get("caption") or "").strip(), (b.get("author") or "anon").strip(), ts))
    c.commit()
    return jsonify(ok=True)


@app.post("/api/finding")
def create_finding():
    """Create a manual finding: src 'manual (<author>)', status Triaging assigned to the author."""
    b = request.get_json(force=True, silent=True) or {}
    ftype = (b.get("type") or "").strip()
    if not ftype:
        abort(400, "type required")
    sev = b.get("severity") if b.get("severity") in ("critical", "high", "medium", "low", "info") else "info"
    hosts = [h.strip() for h in (b.get("hosts") or []) if h and h.strip()]
    author = (b.get("author") or "anon").strip()
    fid = "manual-" + str(int(time.time() * 1000))
    c = db()
    c.execute("INSERT INTO finding(id,type,severity,confidence,source,hosts_json,count,first_seen_run) "
              "VALUES(?,?,?,'high',?,?,?,'manual')",
              (fid, ftype, sev, "manual (%s)" % author, json.dumps(hosts), len(hosts) or 1))
    c.execute("INSERT INTO finding_state(id,status,assignee,updated_at) VALUES(?,'Triaging',?,?)",
              (fid, author, _now()))
    c.commit()
    return jsonify(ok=True, id=fid)


@app.get("/api/finding/<fid>")
def finding(fid):
    c = db()
    r = c.execute("SELECT f.*,s.status,s.assignee,s.updated_at FROM finding f JOIN finding_state s "
                  "USING(id) WHERE f.id=?", (fid,)).fetchone()
    if not r:
        abort(404)
    return jsonify(finding_detail(c, r, host_index(c)))


@app.get("/api/report")
def report():
    """Writing aid: every non-dismissed finding, severity-ordered, each with full evidence/notes."""
    c = db()
    m = host_index(c)
    rows = c.execute("SELECT f.*,s.status,s.assignee,s.updated_at FROM finding f JOIN finding_state s "
                     "USING(id) WHERE s.status != 'Dismissed' "
                     "ORDER BY %s,%s" % (SEV_RANK, CONF_RANK)).fetchall()
    return jsonify([finding_detail(c, r, m) for r in rows])


@app.patch("/api/finding/<fid>")
def patch_finding(fid):
    body = request.get_json(force=True, silent=True) or {}
    sets, vals = [], []
    if "status" in body:
        if body["status"] not in STATUSES:
            abort(400, "bad status")
        sets.append("status=?"); vals.append(body["status"])
    if "assignee" in body:
        sets.append("assignee=?"); vals.append(body["assignee"] or None)
    if not sets:
        abort(400, "nothing to update")
    sets.append("updated_at=?"); vals.append(_now())
    vals.append(fid)
    c = db()
    if not c.execute("UPDATE finding_state SET %s WHERE id=?" % ",".join(sets), vals).rowcount:
        abort(404)
    c.commit()
    return jsonify(ok=True)


@app.post("/api/finding/<fid>/note")
def add_note(fid):
    body = request.get_json(force=True, silent=True) or {}
    text = (body.get("body") or "").strip()
    if not text:
        abort(400, "empty note")
    c = db()
    if not c.execute("SELECT 1 FROM finding WHERE id=?", (fid,)).fetchone():
        abort(404)
    c.execute("INSERT INTO note(target_type,target_id,author,ts,body) VALUES('finding',?,?,?,?)",
              (fid, (body.get("author") or "anon").strip(), _now(), text))
    c.commit()
    return jsonify(ok=True)


@app.get("/api/machines")
def machines():
    c = db()
    out = []
    for r in c.execute("SELECT h.*, COALESCE(m.excluded,0) AS excluded, COALESCE(m.manual,0) AS manual "
                       "FROM host h LEFT JOIN machine_state m USING(ip) ORDER BY h.ip"):
        ports = json.loads(r["ports_json"] or "[]")
        fids = json.loads(r["findings_json"] or "[]")
        out.append({"ip": r["ip"], "hostname": r["hostname"], "os": r["os"], "domain": r["domain"],
                    "ports": [p.get("port") for p in ports], "nports": len(ports),
                    "nfindings": len(fids), "excluded": bool(r["excluded"]), "manual": bool(r["manual"])})
    return jsonify(out)


@app.patch("/api/machine/<ip>")
def patch_machine(ip):
    """Exclude/re-include a host, and -- for hand-added (manual) hosts only -- edit its info:
    hostname, os, domain, and even the ip (which re-keys its notes + evidence)."""
    body = request.get_json(force=True, silent=True) or {}
    c = db()
    if not c.execute("SELECT 1 FROM host WHERE ip=?", (ip,)).fetchone():
        abort(404)
    now = _now()
    if "excluded" in body:
        val = 1 if body["excluded"] else 0
        c.execute("INSERT OR IGNORE INTO machine_state(ip,excluded,updated_at) VALUES(?,?,?)", (ip, val, now))
        c.execute("UPDATE machine_state SET excluded=?, updated_at=? WHERE ip=?", (val, now, ip))

    # info edits: a scanned host's facts are owned by the scan, so only manual hosts are editable
    fields = {k: (body.get(k) or "").strip() for k in ("hostname", "os", "domain") if k in body}
    new_ip = (body.get("ip") or "").strip() if "ip" in body else ""
    if fields or (new_ip and new_ip != ip):
        st = c.execute("SELECT manual FROM machine_state WHERE ip=?", (ip,)).fetchone()
        if not (st and st["manual"]):
            abort(403, "only manually-added hosts can be edited")
        if new_ip and new_ip != ip:
            if ".." in new_ip or not re.match(r"^[A-Za-z0-9._-]+$", new_ip):
                abort(400, "invalid ip/host")
            if c.execute("SELECT 1 FROM host WHERE ip=?", (new_ip,)).fetchone():
                abort(409, "that ip already exists")
            c.execute("UPDATE host SET ip=? WHERE ip=?", (new_ip, ip))
            c.execute("UPDATE machine_state SET ip=? WHERE ip=?", (new_ip, ip))
            c.execute("UPDATE note SET target_id=? WHERE target_type='machine' AND target_id=?", (new_ip, ip))
            c.execute("UPDATE evidence SET target_id=? WHERE target_type='machine' AND target_id=?", (new_ip, ip))
            ip = new_ip
        for k, v in fields.items():
            c.execute("UPDATE host SET %s=? WHERE ip=?" % k, (v, ip))   # k is from the fixed whitelist above
    elif "excluded" not in body:
        abort(400, "nothing to update")
    c.commit()
    return jsonify(ok=True, ip=ip)


@app.post("/api/machine")
def create_machine():
    """Manually add a host to the tracker (os required). A hand-added host is marked manual=1 so its
    facts stay editable; a later scan that finds this IP refreshes them."""
    b = request.get_json(force=True, silent=True) or {}
    ip = (b.get("ip") or "").strip()
    if not ip:
        abort(400, "ip required")
    if ".." in ip or not re.match(r"^[A-Za-z0-9._-]+$", ip):   # it becomes a dir name under EVIDENCE_DIR
        abort(400, "invalid ip/host")
    os_ = (b.get("os") or "").strip()
    if not os_:
        abort(400, "os required")
    hostname = (b.get("hostname") or "").strip()
    domain = (b.get("domain") or "").strip()
    c = db()
    existed = c.execute("SELECT 1 FROM host WHERE ip=?", (ip,)).fetchone()
    c.execute("INSERT OR IGNORE INTO host(ip,hostname,os,domain,ports_json,findings_json) "
              "VALUES(?,?,?,?,'[]','[]')", (ip, hostname, os_, domain))
    manual = 0 if existed else 1   # don't make an already-scanned host editable
    c.execute("INSERT OR IGNORE INTO machine_state(ip,excluded,manual,updated_at) VALUES(?,0,?,?)",
              (ip, manual, _now()))
    c.commit()
    return jsonify(ok=True, ip=ip)


@app.get("/api/machine/<ip>")
def machine(ip):
    c = db()
    r = c.execute("SELECT * FROM host WHERE ip=?", (ip,)).fetchone()
    if not r:
        abort(404)
    fids = json.loads(r["findings_json"] or "[]")
    linked = []
    if fids:
        q = ",".join("?" * len(fids))
        linked = [dict(x) for x in c.execute(
            "SELECT f.id,f.type,f.title,f.severity,s.status FROM finding f JOIN finding_state s USING(id) "
            "WHERE f.id IN (%s) ORDER BY %s" % (q, SEV_RANK), fids)]
    notes = [dict(n) for n in c.execute(
        "SELECT id,author,ts,body FROM note WHERE target_type='machine' AND target_id=? ORDER BY id", (ip,))]
    mrow = c.execute("SELECT manual FROM machine_state WHERE ip=?", (ip,)).fetchone()
    return jsonify({"ip": r["ip"], "hostname": r["hostname"], "os": r["os"], "domain": r["domain"],
                    "ports": json.loads(r["ports_json"] or "[]"), "findings": linked, "notes": notes,
                    "manual": bool(mrow and mrow["manual"]), "captured": captured_for(c, "machine", ip)})


@app.get("/api/machine/<ip>/nmap")
def machine_nmap(ip):
    """The nmap scan report for this host, as text/plain -- opens readable in a new tab for evidence."""
    return app.response_class(nmap_report(ip), mimetype="text/plain; charset=utf-8")


@app.post("/api/machine/<ip>/note")
def add_machine_note(ip):
    body = request.get_json(force=True, silent=True) or {}
    text = (body.get("body") or "").strip()
    if not text:
        abort(400, "empty note")
    c = db()
    if not c.execute("SELECT 1 FROM host WHERE ip=?", (ip,)).fetchone():
        abort(404)
    c.execute("INSERT INTO note(target_type,target_id,author,ts,body) VALUES('machine',?,?,?,?)",
              (ip, (body.get("author") or "anon").strip(), _now(), text))
    c.commit()
    return jsonify(ok=True)


@app.post("/api/finding/<fid>/evidence")
def finding_evidence(fid):
    if not db().execute("SELECT 1 FROM finding WHERE id=?", (fid,)).fetchone():
        abort(404)
    return add_evidence("finding", fid)


@app.post("/api/machine/<ip>/evidence")
def machine_evidence(ip):
    if not db().execute("SELECT 1 FROM host WHERE ip=?", (ip,)).fetchone():
        abort(404)
    return add_evidence("machine", ip)


def _evidence_abspath(rel):
    """Resolve a stored evidence path and refuse anything that escapes SCOPE (traversal guard)."""
    base = os.path.abspath(SCOPE)
    full = os.path.abspath(os.path.join(base, rel))
    if os.path.commonpath([base, full]) != base:
        abort(404)
    return full


@app.get("/api/evidence/<int:eid>")
def get_evidence_file(eid):
    c = db()
    r = c.execute("SELECT path FROM evidence WHERE id=? AND kind='image'", (eid,)).fetchone()
    if not r or not r["path"]:
        abort(404)
    full = _evidence_abspath(r["path"])                      # absolute: send_from_directory needs it
    if not os.path.exists(full):
        abort(404)
    return send_from_directory(os.path.dirname(full), os.path.basename(full))


@app.delete("/api/evidence/<int:eid>")
def del_evidence(eid):
    c = db()
    r = c.execute("SELECT path,kind FROM evidence WHERE id=?", (eid,)).fetchone()
    if not r:
        abort(404)
    if r["kind"] == "image" and r["path"]:
        try:
            os.remove(_evidence_abspath(r["path"]))
        except OSError:
            pass
    c.execute("DELETE FROM evidence WHERE id=?", (eid,))
    c.commit()
    return jsonify(ok=True)


def _latest_run():
    runs = [d for d in glob.glob(os.path.join(SCOPE, "*")) if os.path.isdir(os.path.join(d, "00-discovery"))]
    return max(runs, key=os.path.getmtime) if runs else None


@app.get("/api/progress")
def progress():
    """Scan progress for the thin top bar: which stages have run, and whether a scan is live now."""
    run = _latest_run()
    if not run:
        return jsonify(running=False, pct=0, stage="", run="")
    status = os.path.join(run, "status.jsonl")
    seen, last = set(), ""
    for e in _read_jsonl(status):
        st = (e.get("stage") or "").split("/")[0].strip()
        for s in STAGES_ORDER:
            if st.startswith(s):
                seen.add(s)
        last = e.get("stage") or last
    log = os.path.join(run, "scan.log")
    # "running" = report stage not done yet AND scan.log touched recently (90s window so a quiet stage
    # like nmap's -sn sweep doesn't flip it off mid-scan).
    report_done = "40 report" in seen
    running = (not report_done) and os.path.exists(log) and (time.time() - os.path.getmtime(log) < 90)
    pct = int(100 * len(seen) / len(STAGES_ORDER))
    if report_done:
        pct = 100
    # BloodHound CE runs beside the site (ANCHOR_BLOODHOUND=1 + ANCHOR_BLOODHOUND_PORT); the UI links to it.
    return jsonify(running=running, pct=pct, stage=last, run=os.path.basename(run),
                   bhce=(os.environ.get("ANCHOR_BLOODHOUND") == "1"),
                   bhce_port=os.environ.get("ANCHOR_BLOODHOUND_PORT", "8080"))


@app.get("/api/scanlog")
def scanlog():
    """Tail of the verbose scan log (ANSI stripped) for the Logs tab."""
    run = _latest_run()
    if not run:
        return app.response_class("no scan yet.\n", mimetype="text/plain")
    log = os.path.join(run, "scan.log")
    if not os.path.exists(log):
        return app.response_class("no scan log yet.\n", mimetype="text/plain")
    MAXB = 4_000_000       # return the whole log; only tail if it's pathologically large
    try:
        size = os.path.getsize(log)
        with open(log, "rb") as fh:
            if size > MAXB:
                fh.seek(size - MAXB)
                data = fh.read().decode("utf-8", "replace").split("\n", 1)[-1]   # drop partial 1st line
                data = "… (truncated; showing last %dKB of %dKB) …\n%s" % (MAXB // 1024, size // 1024, data)
            else:
                data = fh.read().decode("utf-8", "replace")
    except OSError:
        data = ""
    return app.response_class(ANSI_RE.sub("", data), mimetype="text/plain; charset=utf-8")


def _notes(c, ttype, tid):
    return " | ".join(n[0] for n in c.execute(
        "SELECT body FROM note WHERE target_type=? AND target_id=? ORDER BY id", (ttype, tid)))


@app.get("/api/export/findings.csv")
def export_findings_csv():
    """Findings as CSV -> import into Google Sheets (File > Import) as a redundant/shareable copy."""
    c = db()
    m = host_index(c)
    rows = c.execute("SELECT f.*,s.status,s.assignee FROM finding f JOIN finding_state s USING(id) "
                     "ORDER BY %s,%s,f.type" % (SEV_RANK, CONF_RANK)).fetchall()
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["severity", "type", "hosts", "source", "confidence", "status", "assignee",
                "count", "first_seen_run", "notes"])
    for r in rows:
        hosts = ", ".join(label_hosts(json.loads(r["hosts_json"] or "[]"), m))
        w.writerow([r["severity"], r["type"], hosts, r["source"], r["confidence"], r["status"],
                    r["assignee"] or "", r["count"], r["first_seen_run"] or "", _notes(c, "finding", r["id"])])
    return app.response_class(out.getvalue(), mimetype="text/csv",
                             headers={"Content-Disposition": "attachment; filename=anchor-findings.csv"})


@app.get("/api/export/machines.csv")
def export_machines_csv():
    c = db()
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["ip", "hostname", "os", "domain", "open_ports", "findings", "excluded", "notes"])
    for r in c.execute("SELECT h.*, COALESCE(m.excluded,0) excl FROM host h "
                       "LEFT JOIN machine_state m USING(ip) ORDER BY h.ip"):
        ports = ", ".join(str(p.get("port")) for p in json.loads(r["ports_json"] or "[]"))
        nf = len(json.loads(r["findings_json"] or "[]"))
        w.writerow([r["ip"], r["hostname"], r["os"], r["domain"], ports, nf,
                    "yes" if r["excl"] else "", _notes(c, "machine", r["ip"])])
    return app.response_class(out.getvalue(), mimetype="text/csv",
                             headers={"Content-Disposition": "attachment; filename=anchor-machines.csv"})


@app.post("/api/ingest")
def reingest():
    nf, nh = ingest_mod.ingest(ingest_mod.connect(DB), SCOPE)
    return jsonify(findings=nf, hosts=nh)


# ---- auto-upload new BloodHound collections into BloodHound CE (when CE runs beside the site) -------
BHCE_URL = os.environ.get("ANCHOR_BHCE_URL")          # e.g. http://localhost:8080
BHCE_USER = os.environ.get("ANCHOR_BHCE_USER", "admin")
BHCE_PASS = os.environ.get("ANCHOR_BHCE_PASS")


def _bhce_req(method, path, body=None, token=None, raw=None, ctype="application/json"):
    hdr, data = {}, None
    if token:
        hdr["Authorization"] = "Bearer " + token
    if raw is not None:
        data = raw; hdr["Content-Type"] = ctype
    elif body is not None:
        data = json.dumps(body).encode(); hdr["Content-Type"] = "application/json"
    r = urllib.request.Request(BHCE_URL.rstrip("/") + path, data=data, headers=hdr, method=method)
    return urllib.request.urlopen(r, timeout=20).read()


def _bhce_upload(zip_path):
    """Push one BloodHound collection zip into CE: login, one upload job, each JSON in, finalize."""
    tok = json.loads(_bhce_req("POST", "/api/v2/login",
        {"login_method": "secret", "username": BHCE_USER, "secret": BHCE_PASS}))["data"]["session_token"]
    uid = json.loads(_bhce_req("POST", "/api/v2/file-upload/start", {}, token=tok))["data"]["id"]
    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(zip_path) as z:
            names = [n for n in z.namelist() if n.lower().endswith(".json")]
            z.extractall(tmp)
        for n in names:
            _bhce_req("POST", "/api/v2/file-upload/%s" % uid, token=tok,
                      raw=open(os.path.join(tmp, n), "rb").read(), ctype="application/json")
    _bhce_req("POST", "/api/v2/file-upload/%s/end" % uid, {}, token=tok)


def _bhce_sync():
    """Auto-import any new bloodhound zip into CE; a .uploaded marker makes it once-only across restarts.
    Bounded retries: a zip CE keeps rejecting (bad cred / malformed JSON) would otherwise spawn a fresh
    CE upload job every tick forever -- give up after 5 tries so it stops orphaning jobs."""
    if not (BHCE_URL and BHCE_PASS):
        return
    for z in glob.glob(os.path.join(SCOPE, "*", "20-ad", "raw", "*_bloodhound.zip")):
        if os.path.exists(z + ".uploaded"):
            continue
        try:
            _bhce_upload(z)
            open(z + ".uploaded", "w").write(_now())
        except Exception as e:
            fails = (int(open(z + ".fails").read().strip() or 0) if os.path.exists(z + ".fails") else 0) + 1
            open(z + ".fails", "w").write(str(fails))
            sys.stderr.write("[anchor-site] BHCE upload failed (try %d) for %s: %s\n" % (fails, z, e))
            if fails >= 5:
                open(z + ".uploaded", "w").write(_now() + " FAILED after %d tries" % fails)


def _auto_ingest(interval):
    """Live refresh: rebuild the latest run's 40-report from raw (so new hosts/findings appear mid-scan,
    not just at the final report stage), then re-ingest. No manual Re-ingest needed."""
    import threading, time as _t
    import traceback
    def loop():
        while True:
            _t.sleep(interval)
            try:
                if merge_mod:
                    run = _latest_run()
                    if run:
                        merge_mod.build(run)        # partial raw is fine; grows as the scan runs
                ingest_mod.ingest(ingest_mod.connect(DB), SCOPE)
            except Exception:
                traceback.print_exc()  # don't die silently: a persistent failure would freeze live refresh
            try:
                _bhce_sync()           # off the ingest path: a slow/down CE must not stall the live refresh
            except Exception:
                traceback.print_exc()
    t = threading.Thread(target=loop, daemon=True)
    t.start()


if __name__ == "__main__":
    nf, nh = ingest_mod.ingest(ingest_mod.connect(DB), SCOPE)
    print("[anchor-site] scope=%s db=%s  ingested %d findings, %d hosts  ->  http://0.0.0.0:%d"
          % (SCOPE, DB, nf, nh, PORT))
    _auto_ingest(int(os.environ.get("ANCHOR_INGEST_INTERVAL", "6")))
    app.run(host="0.0.0.0", port=PORT, threaded=True)
