#!/usr/bin/env python3
"""Tests for stages/merge.py. Run: python3 tests/test_merge.py  (stdlib only, no framework)."""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(HERE, "fixtures")
sys.path.insert(0, os.path.join(HERE, "..", "stages"))
import merge  # noqa: E402


def test_dedup_collapses_same_finding_across_hosts():
    raw = merge.load_nuclei(os.path.join(FIX, "nuclei.json"))
    records = merge.dedup_findings(raw)
    git = [r for r in records if r["type"] == "exposed-git-config"]
    assert len(git) == 1, "the 3-host finding must collapse to one record"
    assert git[0]["count"] == 3, "count must be 3"
    assert git[0]["hosts"] == ["10.0.0.5", "10.0.0.6", "10.0.0.7"], "hosts sorted and unique"
    # id is a stable sha1 of the TYPE (not the host set) -- see test_finding_id_is_stable_as_hosts_accumulate
    assert len(git[0]["id"]) == 40 and all(c in "0123456789abcdef" for c in git[0]["id"])


def test_finding_id_is_stable_as_hosts_accumulate():
    # #1 data-loss regression: the id must NOT change when a finding is later seen on one more host,
    # or the team's triage overlay (status/assignee/notes, keyed by id) gets orphaned on a dead id.
    base = {"type": "smb-signing-not-required", "severity": "medium", "confidence": "high", "source": "nxc"}
    one = merge.dedup_findings([dict(base, host="10.0.0.5")])
    two = merge.dedup_findings([dict(base, host="10.0.0.5"), dict(base, host="10.0.0.6")])
    assert one[0]["id"] == two[0]["id"], "finding id must be host-independent (hosts are a mutable fact)"
    assert two[0]["count"] == 2 and two[0]["hosts"] == ["10.0.0.5", "10.0.0.6"]


def test_attack_surface_tasks():
    hosts = {"10.0.0.5": {"ip": "10.0.0.5", "ports": [
        {"port": 3000, "proto": "tcp", "service": "ppp", "product": "", "version": ""},   # web via httpx
        {"port": 23, "proto": "tcp", "service": "telnet", "product": "", "version": ""},   # surface
        {"port": 31337, "proto": "tcp", "service": "", "product": "", "version": ""},       # unusual
        {"port": 53, "proto": "udp", "service": "domain", "product": "", "version": ""},    # common infra
    ]}}
    httpx = {("10.0.0.5", "3000"): {"url": "http://10.0.0.5:3000", "title": "OWASP Juice Shop",
                                    "webserver": "", "tech": ["Angular"], "status": 200}}
    f = merge.load_attack_surface(hosts, httpx, {})   # no prior run -> nothing counts as "new"
    types = {x["type"] for x in f}
    assert "web:10.0.0.5:3000" in types, "a live website must become a task"
    web = next(x for x in f if x["type"] == "web:10.0.0.5:3000")
    assert "OWASP Juice Shop" in web["title"] and "10.0.0.5:3000" in web["title"], "site name + ip:port in title"
    assert "Juice Shop" in web["detail"], "detail carries the httpx/nmap info"
    assert any(x["type"] == "surface:10.0.0.5:23/tcp" and x["severity"] == "medium" for x in f), "telnet (cleartext) stays medium"
    assert any(x["type"] == "openport:10.0.0.5:31337/tcp" and x["severity"] == "info" for x in f), "an uncommon port -> info unusual/new-port task"
    assert not any("53/udp" in t for t in types), "a common infra port that isn't new -> no task"
    # with a prior run that had NO ports, the common 53/udp is now 'newly open' -> tasked
    f2 = merge.load_attack_surface(hosts, httpx, {"10.0.0.5": set()})
    assert any("openport:10.0.0.5:53/udp" in x["type"] for x in f2), "a newly-open common port -> task"


def test_sort_puts_criticals_first():
    records = merge.sort_findings(merge.dedup_findings(merge.load_nuclei(os.path.join(FIX, "nuclei.json"))))
    assert records[0]["severity"] == "critical", "criticals sort first"
    assert records[0]["type"] == "apache-struts-rce"
    ranks = [merge.SEV[r["severity"]] for r in records]
    assert ranks == sorted(ranks), "findings are in non-decreasing severity order"


def test_ad_loot_stays_cleartext():
    findings, loot = merge.load_ad(FIX)
    assert any("Backup#2024!" in line for line in loot), "cleartext password must survive unmasked"
    assert any("31d6cfe0d16ae931b73c59d7e0c089c0" in line for line in loot), "NT hash must survive"
    assert any(f["type"] == "adcs-esc1" and f["severity"] == "critical" for f in findings), "ESC1 -> critical"
    # roastable hashes surface as findings + cleartext loot (GOAD regression: the AS-REP win was
    # captured to disk but never reached the report)
    assert any("$krb5asrep$" in line for line in loot), "AS-REP hash must reach loot"
    assert any(f["type"] == "asrep-roastable" and f["severity"] == "high" for f in findings), "AS-REP -> high"


def test_secretsdump_banner_is_not_a_credential(tmp="/tmp/anchor-sd-test"):
    # GOAD regression: an access-denied secretsdump leaves only the Impacket banner. The old parser
    # counted it as a credential and fabricated a critical `credentials-dumped`.
    os.makedirs(tmp, exist_ok=True)
    with open(os.path.join(tmp, "secretsdump.txt"), "w") as f:
        f.write("Impacket v0.14.0 - Copyright Fortra, LLC\n\n"
                "[-] RemoteOperations failed: rpc_s_access_denied\n"
                "[*] Cleaning up...\n")
    findings, loot = merge.load_ad(tmp)
    assert not any(f["type"] == "credentials-dumped" for f in findings), "no creds dumped -> no finding"
    assert loot == [], "the banner is not loot"


def test_nxc_and_nmap_feed_hosts_and_findings():
    nmap_hosts = merge.load_nmap(os.path.join(FIX, "nmap.xml"))
    assert "10.0.0.5" in nmap_hosts
    assert sorted(p["port"] for p in nmap_hosts["10.0.0.5"]["ports"]) == [22, 80, 443], "only open ports"
    nxc_hosts, nxc_find = merge.load_nxc(os.path.join(FIX, "nxc-smb.txt"))
    assert "10.0.0.11" in nxc_hosts
    assert any(f["type"] == "smb-signing-not-required" and f["host"] == "10.0.0.11" for f in nxc_find)


def test_scan_health_lists_failures():
    status = merge.load_status(os.path.join(FIX, "status.jsonl"))
    md = "\n".join(merge.render_health(status))
    assert "## Scan health" in md
    assert "timeout" in md and "nuclei" in md, "the timed-out tool must appear"
    assert "failed" in md and "ffuf" in md, "the failed tool must appear"
    assert "skipped" in md and "kerbrute" in md, "the skipped tool must appear"
    assert "nmap" not in md, "ok tools must not clutter scan health"
    # a clean ledger collapses to one reassuring line
    ok = "\n".join(merge.render_health([{"stage": "x", "tool": "nmap", "status": "ok", "exit": 0}]))
    assert "All scans ok." in ok


def test_end_to_end_build(tmp="/tmp/anchor-merge-test"):
    # lay the fixtures into a run tree and run the whole build
    import shutil
    shutil.rmtree(tmp, ignore_errors=True)
    for sub in ("00-discovery/raw", "10-web", "20-ad/raw", "30-vuln", "40-report"):
        os.makedirs(os.path.join(tmp, sub), exist_ok=True)
    shutil.copy(os.path.join(FIX, "nuclei.json"), os.path.join(tmp, "30-vuln", "nuclei.json"))
    shutil.copy(os.path.join(FIX, "nmap.xml"), os.path.join(tmp, "00-discovery", "raw", "nmap.xml"))
    shutil.copy(os.path.join(FIX, "nxc-smb.txt"), os.path.join(tmp, "00-discovery", "raw", "nxc-smb.txt"))
    shutil.copy(os.path.join(FIX, "certipy.txt"), os.path.join(tmp, "20-ad", "raw", "certipy.txt"))
    shutil.copy(os.path.join(FIX, "secretsdump.txt"), os.path.join(tmp, "20-ad", "raw", "secretsdump.txt"))
    shutil.copy(os.path.join(FIX, "status.jsonl"), os.path.join(tmp, "status.jsonl"))
    records, hosts = merge.build(tmp)
    assert os.path.exists(os.path.join(tmp, "40-report", "findings.jsonl"))
    summary = open(os.path.join(tmp, "40-report", "summary.md")).read()
    assert "Backup#2024!" in summary, "loot must appear cleartext in the summary"
    assert records[0]["severity"] == "critical"
    assert "## Scan health" in summary and "nuclei" in summary, "scan health must reach the summary"
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for t in tests:
        try:
            t()
            print("PASS", t.__name__)
        except AssertionError as e:
            failed += 1
            print("FAIL", t.__name__, "--", e)
        except Exception as e:  # noqa: BLE001
            failed += 1
            print("ERROR", t.__name__, "--", type(e).__name__, e)
    print("\n%d passed, %d failed" % (len(tests) - failed, failed))
    sys.exit(1 if failed else 0)
