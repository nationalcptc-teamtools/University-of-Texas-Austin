# Anchor

A staged network-scan pipeline for CPTC, plus a live triage web app. A GNU Make DAG
drives bash stages and a stdlib-Python merge; one subnet in, one ranked/deduped
findings queue out — fast enough to leave time for manual work.

## Pipeline

```
00-discovery ─┬─ 10-web ── 30-vuln ─┐
              └─ 20-ad/unauth ───────┴─ 40-report ── 60-deep ── (re-merge)
                                         (50-relay is part of the credentialed AD flow)
```

- **00 discovery** — host discovery (fping + masscan/nmap), full TCP port scan, service detection.
- **10 web** — httpx (live URLs + tech), katana crawl, ffuf content discovery.
- **20 ad/unauth** — unauthenticated AD enum (nxc null session, kerbrute).
- **30 vuln** — nuclei (tag-matched + severity-gated passes), testssl on TLS.
- **40 report** — merge raw output into `findings.jsonl`, `hosts.jsonl`, and a ranked `summary.md`.
- **60 deep** — the thorough pass *after* the quick report: full TCP (`-p-`) then UDP (top-200),
  which auto-files a task per website, per notable service (telnet/ftp/rdp/db/…), and per
  uncommon-or-newly-open port.

Credentials/hashes found are kept **in the clear** (engagement loot). `engagement/` is gitignored.

## Run

Docker (recommended — the image carries every tool):

```bash
cd docker
./build.sh                                  # add --without-ad for a lean, no-AD image
docker compose up -d target anchor          # a vulnerable target + the tools container
docker compose exec anchor make scan SUBNET=<cidr> PROFILE=normal
docker compose exec anchor cat engagement/<scope>/latest/40-report/summary.md
```

Or from a host with the tools installed:

```bash
./run.sh                  # profile menu, parallel output, auto-boots the triage site
./run.sh normal SUBNET=10.0.0.0/24
make quick SUBNET=<cidr>  # stop at the quick report (skip the slow deep pass)
```

- `PROFILE=gentle|normal|fast` — one knob throttles every tool (see `profiles/*.mk`).
- Output lands in `engagement/<scope>/<run>/`, with `latest` → the newest run.
- `scan.log` has the full log; `summary.md` is the ranked report plus a **Scan health** table.

### Credentialed AD (manual, off the auto DAG)

```bash
make ad-auth CREDS=user:pass SCOPE=<scope> RUN=<prior-run>   # pass-the-hash: CREDS=user:<NThash>
```

Reuses a prior run's discovered hosts, runs authed enum (nxc, certipy, secretsdump,
bloodhound-ce, RelayKing), and re-runs the report.

## Triage site

```bash
make site                 # serves the latest engagement at http://0.0.0.0:8000
make site SCOPE=goad4     # a specific engagement
```

A long-running Flask + SQLite app (separate from the scan) that ingests `40-report`
output live:

- **Queue** grouped by status (New / Triaging / Confirmed / Dismissed / In report); each
  event carries a one-sentence "why it was tagged", the real command/evidence, and a
  notes+evidence thread (paste screenshots).
- Changing a New event's status claims it to you; filters, manual events, and CSV export
  (findings + machines) for Google Sheets.
- **Machines** tab with open ports, per-host findings, exclude/add, and editable info for
  hand-added hosts.
- Live "new" dots + a scan-progress bar; a Logs tab with the sectioned scan log.

## BloodHound CE

```bash
make bloodhound           # postgres + neo4j + bloodhound on 0.0.0.0:8080
```

Captures the admin password to `docker/bloodhound/.bhce-pass` (gitignored); `make site`
then wires auto-import of collection zips and the graph link.
