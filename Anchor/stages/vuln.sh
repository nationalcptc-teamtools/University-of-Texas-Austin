#!/usr/bin/env bash
# Stage 30 vuln: nuclei over the live URLs (profile-tuned, DOS/fuzz/intrusive excluded, no OOB, no auto-update),
# plus testssl on TLS services. Honors $NUCLEI_C / $NUCLEI_RL / $NUCLEI_BS.
set -euo pipefail
OUT="${1:?output dir}"; STAGE="30 vuln"
. "$(dirname "$0")/_lib.sh"
d="$OUT/30-vuln"; mkdir -p "$d/raw"
urls="$OUT/10-web/urls.txt"
# nuclei scans base ORIGINS (scheme://host:port), not every crawled URL: its templates probe their
# own paths, so feeding it main.js/vendor.js just multiplies requests ~6-20x for the same findings.
origins="$d/origins.txt"
# Drop known dead-weight web ports before nuclei: :5357 (Windows WSDAPI/HTTPAPI) answers slowly and
# yields nothing, so on an AD estate it can be most of the origins and eats the whole time budget for
# zero findings. Override/extend with NUCLEI_SKIP_PORTS="5357,5985".
skip="${NUCLEI_SKIP_PORTS:-5357}"
sed -E 's#^(https?://[^/]+).*#\1#' "$urls" 2>/dev/null | sort -u \
  | grep -vE ":(${skip//,/|})$" > "$origins" || true

# Two-pass nuclei: the high-yield CPTC tags run FIRST (fast) so the findings that matter surface
# right away; the rest of the library runs second for coverage (a few minutes). Pass 2 excludes
# pass 1's tags, so there's no overlap. Override the tag set with NUCLEI_TAGS=... if needed.
NC="${NUCLEI_C:-10}"; NRL="${NUCLEI_RL:-50}"; NBS="${NUCLEI_BS:-10}"
# Per-request timeout: the default 10s lets slow/filtered endpoints (e.g. :5357 WSDAPI) eat the whole
# budget. 7s keeps a pass moving so it actually finishes instead of being killed mid-sweep.
NTO="${NUCLEI_REQ_TIMEOUT:-7}"

if [ -s "$origins" ]; then
  # Pass 1 (fast): TECH-MATCHED, not a blind tag sweep. nuclei -as fingerprints each target
  # (wappalyzer) and runs ONLY templates for the detected stack -- the same service/version context
  # nmap -sV / httpx gather -- so it's a few hundred relevant templates, not ~4k. Capped as a safety net.
  # Override with NUCLEI_TAGS=... to force an explicit tag set instead.
  if [ -n "${NUCLEI_TAGS:-}" ]; then P1=(-tags "$NUCLEI_TAGS"); P1D="tags $NUCLEI_TAGS"; else P1=(-as); P1D="auto tech-matched (-as)"; fi
  banner "nuclei pass 1/2 · $P1D · -c $NC -rl $NRL -bs $NBS · cap ${NUCLEI_FAST_TIMEOUT:-360}s"
  ( export TOOL_TIMEOUT="${NUCLEI_FAST_TIMEOUT:-360}"
    run nuclei -l "$origins" -c "$NC" -rl "$NRL" -bs "$NBS" "${P1[@]}" -timeout "$NTO" -ni -duc \
        -o "$d/raw/nuclei-tags.jsonl" -j -me "$d/raw/nuclei.md" )
  # Pass 2 (coverage): the whole library down to LOW severity (critical/high/medium/low) -- catches the
  # CVEs / misconfigs / exposures / default-logins AND low-sev config issues (missing HTTPS/HSTS, weak
  # headers) the tech-match missed. The old full-library sweep (~9k templates incl. thousands of info)
  # couldn't finish in the cap; gating out only 'info' keeps it bounded. Info still comes from pass 1's
  # -as. Override with NUCLEI_COVER_SEV=... (e.g. add 'info', or drop 'low' for speed).
  banner "nuclei pass 2/2 · coverage · sev ${NUCLEI_COVER_SEV:-critical,high,medium,low} · cap ${NUCLEI_FULL_TIMEOUT:-420}s"
  ( export TOOL_TIMEOUT="${NUCLEI_FULL_TIMEOUT:-420}"
    run nuclei -l "$origins" -c "$NC" -rl "$NRL" -bs "$NBS" -s "${NUCLEI_COVER_SEV:-critical,high,medium,low}" \
        -etags dos,fuzz,intrusive -timeout "$NTO" -ni -duc \
        -o "$d/raw/nuclei-rest.jsonl" -j -me "$d/raw/nuclei.md" )
else
  banner "no web URLs; writing empty findings"
  record nuclei skipped 0 "no web urls"
fi

# Combine both passes (streaming JSONL -> one JSON array the merge reads). JSONL survives a timeout
# kill: nuclei writes each finding as it's found, so a capped/killed pass keeps what it already found.
python3 - "$d/nuclei.json" "$d/raw/nuclei-tags.jsonl" "$d/raw/nuclei-rest.jsonl" <<'PY' || true
import json, sys
out_path, ins = sys.argv[1], sys.argv[2:]
merged = []
for p in ins:
    try:
        for line in open(p):
            line = line.strip()
            if not line:
                continue
            try:
                merged.append(json.loads(line))
            except json.JSONDecodeError:
                pass  # tolerate a partial final line from a killed pass
    except FileNotFoundError:
        pass
json.dump(merged, open(out_path, "w"))
PY

# testssl on any TLS web targets (ports 443 / 8443)
if command -v testssl.sh >/dev/null 2>&1; then
  { grep -E ':(443|8443)$' "$OUT/00-discovery/web-targets.txt" 2>/dev/null || true; } | while IFS= read -r tgt; do
    [ -n "$tgt" ] || continue
    safe=$(printf '%s' "$tgt" | tr -c 'A-Za-z0-9' '_')
    capture "$d/raw/testssl-$safe.txt" testssl.sh --quiet --color 0 "$tgt"
  done
else
  record testssl.sh skipped 0 "not installed"
fi

n=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(len(d) if isinstance(d,list) else 1)' "$d/nuclei.json" 2>/dev/null || echo 0)
done_line "$n nuclei findings"
