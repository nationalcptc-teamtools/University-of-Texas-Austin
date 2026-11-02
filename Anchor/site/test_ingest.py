#!/usr/bin/env python3
"""The one check that matters: re-ingesting a later run must NOT clobber triage work.
Run: python3 site/test_ingest.py   (stdlib only, no framework)."""
import os
import sys
import json
import time
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import ingest  # noqa: E402


def _run(scope, name, findings, hosts=()):
    rep = os.path.join(scope, name, "40-report")
    os.makedirs(rep, exist_ok=True)
    with open(os.path.join(rep, "findings.jsonl"), "w") as f:
        for r in findings:
            f.write(json.dumps(r) + "\n")
    with open(os.path.join(rep, "hosts.jsonl"), "w") as f:
        for h in hosts:
            f.write(json.dumps(h) + "\n")


def test_reingest_preserves_triage_overlay():
    with tempfile.TemporaryDirectory() as scope:
        A = {"id": "aaa", "type": "adcs-esc8", "severity": "critical", "confidence": "high",
             "source": "certipy", "hosts": ["dc01"], "count": 1}
        _run(scope, "20260101-0000", [A])
        db = os.path.join(scope, "triage.db")
        conn = ingest.connect(db)
        ingest.ingest(conn, scope)

        # analyst works finding A: confirm it, assign it, leave a note
        conn.execute("UPDATE finding_state SET status='Confirmed', assignee='jon', updated_at=? WHERE id='aaa'",
                     (time.strftime("%Y-%m-%dT%H:%M:%SZ"),))
        conn.execute("INSERT INTO note(target_type,target_id,author,ts,body) VALUES('finding','aaa','jon','t','verified by hand')")
        conn.commit()

        # a later run re-surfaces A (count bumped) and brings a new finding B
        A2 = dict(A, count=3)
        B = {"id": "bbb", "type": "kerberoastable", "severity": "high", "confidence": "high",
             "source": "netexec", "hosts": ["domain"], "count": 1}
        _run(scope, "20260101-0100", [A2, B])
        ingest.ingest(conn, scope)

        a = conn.execute("SELECT status,assignee FROM finding_state WHERE id='aaa'").fetchone()
        assert a == ("Confirmed", "jon"), "re-ingest must NOT reset the analyst's status/assignee: %r" % (a,)
        notes = conn.execute("SELECT body FROM note WHERE target_id='aaa'").fetchall()
        assert notes == [("verified by hand",)], "notes must survive re-ingest: %r" % (notes,)
        cnt = conn.execute("SELECT count FROM finding WHERE id='aaa'").fetchone()[0]
        assert cnt == 3, "facts (count) must refresh to the latest run: %r" % (cnt,)
        b = conn.execute("SELECT status FROM finding_state WHERE id='bbb'").fetchone()
        assert b == ("New",), "the new finding must arrive as New: %r" % (b,)
        fsr = conn.execute("SELECT first_seen_run FROM finding WHERE id='aaa'").fetchone()[0]
        assert fsr == "20260101-0000", "first_seen_run must stay the earliest: %r" % (fsr,)


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    passed = 0
    for fn in fns:
        try:
            fn()
            print("PASS", fn.__name__)
            passed += 1
        except AssertionError as e:
            print("FAIL", fn.__name__, "->", e)
    print("\n%d passed, %d failed" % (passed, len(fns) - passed))
    sys.exit(0 if passed == len(fns) else 1)
