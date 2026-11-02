#!/usr/bin/env python3
"""Ingest a scope's stage-40 output into the triage store.

Idempotent: findings/hosts are upserted by their stable id/ip, so re-ingesting a
new run (or a new-endpoint scan mid-comp) refreshes the facts WITHOUT touching the
team's triage overlay -- finding_state rows are created once and never overwritten.
That survival-across-re-ingest is the one property the test suite checks.

Usage: python3 ingest.py <scope-dir> [<triage.db>]   # db defaults to <scope-dir>/triage.db
stdlib only.
"""
import os
import sys
import json
import glob
import time
import sqlite3

HERE = os.path.dirname(os.path.abspath(__file__))


def connect(db):
    c = sqlite3.connect(db)
    c.execute("PRAGMA journal_mode=WAL")       # multi-reader + one writer: fine for a small team
    c.execute("PRAGMA busy_timeout=4000")      # wait out a concurrent writer instead of 'database is locked'
    c.executescript(open(os.path.join(HERE, "schema.sql"), encoding="utf-8").read())
    for mig in ("ALTER TABLE machine_state ADD COLUMN manual INTEGER NOT NULL DEFAULT 0",
                "ALTER TABLE finding ADD COLUMN title TEXT",
                "ALTER TABLE finding ADD COLUMN detail TEXT"):
        try:                                    # migrate pre-existing DBs; no-op once the column exists
            c.execute(mig)
        except sqlite3.OperationalError:
            pass
    return c


def _jsonl(path):
    if not os.path.exists(path):
        return
    for line in open(path, encoding="utf-8", errors="replace"):
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue  # tolerate a partial final line
        if isinstance(obj, dict):  # skip a stray scalar/array line; consumers call .get()
            yield obj


def ingest(conn, scope_dir):
    """Upsert every run's 40-report under scope_dir. Returns (n_findings, n_hosts) seen."""
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    nf = nh = 0
    # oldest run first, so first_seen_run records where a finding actually first appeared
    for rep in sorted(glob.glob(os.path.join(scope_dir, "*", "40-report"))):
        run = os.path.basename(os.path.dirname(rep))
        for r in _jsonl(os.path.join(rep, "findings.jsonl")):
            if "id" not in r:
                continue
            conn.execute(
                """INSERT INTO finding(id,type,severity,confidence,source,hosts_json,count,first_seen_run,title,detail)
                   VALUES(?,?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(id) DO UPDATE SET
                     type=excluded.type, severity=excluded.severity, confidence=excluded.confidence,
                     source=excluded.source, hosts_json=excluded.hosts_json, count=excluded.count,
                     title=excluded.title, detail=excluded.detail""",
                (r["id"], r.get("type"), r.get("severity"), r.get("confidence"), r.get("source"),
                 json.dumps(r.get("hosts", [])), r.get("count", 1), run,
                 r.get("title") or "", r.get("detail") or ""))
            # overlay: created once, left alone forever after -- this is the no-clobber guarantee
            conn.execute("INSERT OR IGNORE INTO finding_state(id,status,updated_at) VALUES(?,'New',?)",
                         (r["id"], now))
            nf += 1
        for h in _jsonl(os.path.join(rep, "hosts.jsonl")):
            if "ip" not in h:
                continue
            conn.execute(
                """INSERT INTO host(ip,hostname,os,domain,ports_json,findings_json)
                   VALUES(?,?,?,?,?,?)
                   ON CONFLICT(ip) DO UPDATE SET
                     hostname=excluded.hostname, os=excluded.os, domain=excluded.domain,
                     ports_json=excluded.ports_json, findings_json=excluded.findings_json""",
                (h["ip"], h.get("hostname"), h.get("os"), h.get("domain"),
                 json.dumps(h.get("ports", [])), json.dumps(h.get("findings", []))))
            conn.execute("INSERT OR IGNORE INTO machine_state(ip,excluded,updated_at) VALUES(?,0,?)",
                         (h["ip"], now))
            nh += 1
    conn.commit()
    return nf, nh


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: ingest.py <scope-dir> [<triage.db>]")
    scope = sys.argv[1]
    dbp = sys.argv[2] if len(sys.argv) > 2 else os.path.join(scope, "triage.db")
    conn = connect(dbp)
    f, h = ingest(conn, scope)
    print("ingested %d finding rows, %d host rows -> %s" % (f, h, dbp))
