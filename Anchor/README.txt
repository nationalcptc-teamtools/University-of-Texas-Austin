===============================================================================
 ANCHOR  —  staged network-scan pipeline + live triage site
===============================================================================

-------------------------------------------------------------------------------
 QUICK START  —  copy/paste the block, then set SUBNET to your target range
-------------------------------------------------------------------------------
 Needs: Docker (with the compose plugin) and access to UT-CTF/Anchor.
 Clones the repo, builds the tools image, scans your target subnet
 end-to-end, and prints the ranked report.

    git clone https://github.com/UT-CTF/Anchor.git && cd Anchor/docker
    ./build.sh
    docker compose up -d
    docker compose exec anchor make scan SUBNET=<TARGET_CIDR>      # <-- set this, e.g. 10.0.0.0/24
    docker compose exec anchor cat engagement/cptc/latest/40-report/summary.md

 Replace <TARGET_CIDR> with your scope (e.g. 10.0.0.0/24) — SUBNET is required on every scan.
 No target network handy? Smoke-test against the bundled vulnerable targets instead:
    docker compose exec anchor make scan TARGETS="target dvwa vampi"

 Already cloned? Skip the first line and run the rest from inside Anchor/docker.
 Lean, no-AD image (faster build): run  ./build.sh --without-ad  instead.

-------------------------------------------------------------------------------
 WHAT YOU JUST RAN
-------------------------------------------------------------------------------
 A GNU Make DAG drives bash stages + a stdlib-Python merge. One scope in,
 one ranked/deduped findings queue out.

   00 discovery  host discovery + full TCP port scan + service detection
   10 web        httpx (live URLs + tech), katana crawl, ffuf content discovery
   20 ad/unauth  unauthenticated AD enum (nxc null session, kerbrute)
   30 vuln       nuclei (tag + severity passes), testssl on TLS
   40 report     merge -> findings.jsonl, hosts.jsonl, ranked summary.md
   60 deep       full TCP (-p-) + UDP top-200, auto-files a task per site /
                 notable service / uncommon-or-newly-open port

 Output lands in  engagement/<scope>/<run>/ , with  latest -> newest run.
 scan.log is the full log; summary.md is the ranked report + a Scan health table.
 Credentials/hashes found are kept in the clear (engagement loot).
 engagement/ is gitignored — nothing sensitive is ever committed.

-------------------------------------------------------------------------------
 REAL ENGAGEMENT (scan an actual subnet)
-------------------------------------------------------------------------------
 In Docker:
    docker compose exec anchor make scan SUBNET=10.0.0.0/24 PROFILE=normal SCOPE=job1
    docker compose exec anchor cat engagement/job1/latest/40-report/summary.md

 On a host with the tools installed (no Docker):
    ./run.sh                          # profile menu, parallel output, auto-boots the site
    ./run.sh normal SUBNET=10.0.0.0/24
    make quick SUBNET=<cidr>          # stop at the quick report (skip the deep pass)

 PROFILE=gentle|normal|fast — one knob throttles every tool (see profiles/*.mk).
   gentle ~500 pps (fragile infra) · normal ~2000 pps (default) · fast ~5000 pps

-------------------------------------------------------------------------------
 TRIAGE SITE  (team queue, separate from the scan)
-------------------------------------------------------------------------------
    make site                 # latest engagement at http://0.0.0.0:8000
    make site SCOPE=goad4     # a specific engagement

 Flask + SQLite, ingests 40-report output live (~15s). Queue grouped by status
 (New / Triaging / Confirmed / Dismissed / In report); each event carries a
 one-line "why it was tagged", the real command/evidence, and a notes thread
 (paste screenshots). Machines tab, live new-dots + scan-progress bar, a Logs
 tab, and CSV export (findings + machines) for Google Sheets.

-------------------------------------------------------------------------------
 CREDENTIALED AD  (manual, off the auto DAG)
-------------------------------------------------------------------------------
    make ad-auth CREDS=user:pass SCOPE=<scope> RUN=<prior-run>
    # pass-the-hash:  CREDS=user:<NThash>

 Reuses a prior run's discovered hosts, runs authed enum (nxc, certipy,
 secretsdump, bloodhound-ce, RelayKing), and re-runs the report.

-------------------------------------------------------------------------------
 BLOODHOUND CE
-------------------------------------------------------------------------------
    make bloodhound           # postgres + neo4j + bloodhound on 0.0.0.0:8080

 Captures the admin password to docker/bloodhound/.bhce-pass (gitignored);
 make site then wires auto-import of collection zips and the graph link.
