#!/usr/bin/env bash
# Stage 40 report: merge raw stage output into findings.jsonl, hosts.jsonl, and a ranked,
# deduped summary.md. Loot stays cleartext in the summary. All logic lives in merge.py (stdlib).
set -euo pipefail
OUT="${1:?output dir}"; STAGE="40 report"
. "$(dirname "$0")/_lib.sh"
here="$(dirname "$0")"

banner "merge · rank · dedup"
run python3 "$here/merge.py" "$OUT"
# run() self-heals (always returns 0) so a scanner glitch can't abort the DAG -- but summary.md is the
# actual deliverable here, so judge success by the artifact, not the exit code (like ad-auth's zip check).
if [ -s "$OUT/40-report/summary.md" ]; then
  done_line "summary -> $OUT/40-report/summary.md"
else
  fail_banner "merge.py produced no summary.md (see scan.log)"; exit 1
fi
