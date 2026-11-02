#!/usr/bin/env bash
# Stage 10 web: httpx (live URLs + tech) -> urls.txt, katana crawl, ffuf content discovery.
# Honors $FFUF_THREADS. Exits clean with empty output when there are no web targets.
set -euo pipefail
OUT="${1:?output dir}"; STAGE="10 web"
. "$(dirname "$0")/_lib.sh"
d="$OUT/10-web"; mkdir -p "$d/raw"
here="$(dirname "$0")"
wt="$OUT/00-discovery/web-targets.txt"

banner "httpx · katana · ffuf -t ${FFUF_THREADS:-?}"
if [ ! -s "$wt" ]; then
  : > "$d/urls.txt"
  for t in httpx katana ffuf; do record "$t" skipped 0 "no web targets"; done
  done_line "no web targets; skipped"
  exit 0
fi

# 1) httpx: probe targets, keep JSONL evidence, derive urls.txt (the live URLs)
# -timeout/-retries so a probe of a non-HTTP(S) service (e.g. an https probe of an http-only port)
# can't hang the stage; httpx reports only what actually speaks HTTP.
capture "$d/raw/httpx.jsonl" httpx -l "$wt" -json -silent -timeout 8 -retries 1 || true
# NOT via run(): this reads its script from the heredoc on stdin, which run()'s </dev/null would eat.
python3 - "$d/raw/httpx.jsonl" "$d/urls.txt" <<'PY' || true
import json, os, sys
inf, outf = sys.argv[1], sys.argv[2]
urls = []
try:
    for line in open(inf, encoding="utf-8", errors="replace"):
        line = line.strip()
        if not line:
            continue
        try:
            u = json.loads(line).get("url")
            if u:
                urls.append(u)
        except json.JSONDecodeError:
            pass
except FileNotFoundError:
    pass
open(outf + ".tmp", "w").write("\n".join(urls) + ("\n" if urls else ""))
os.replace(outf + ".tmp", outf)
print("httpx: %d live URLs" % len(urls))
PY
[ -f "$d/urls.txt" ] || : > "$d/urls.txt"

# 2) katana crawl of the live URLs (append any new paths, keep unique)
if command -v katana >/dev/null 2>&1 && [ -s "$d/urls.txt" ]; then
  capture "$d/raw/katana.txt" katana -list "$d/urls.txt" -silent
  if [ -s "$d/raw/katana.txt" ]; then
    sort -u "$d/urls.txt" "$d/raw/katana.txt" > "$d/urls.txt.tmp" && mv "$d/urls.txt.tmp" "$d/urls.txt"
  fi
else
  command -v katana >/dev/null 2>&1 || record katana skipped 0 "not installed"
fi

# 3) ffuf content discovery. Fuzz base ORIGINS only (scheme://host:port), deduped -- NOT every
# discovered URL, or it re-fuzzes main.js/vendor.js with the whole wordlist (the ~15 min blowup).
# Each origin is capped by FFUF_TIMEOUT so one slow host can't drag the stage.
wl=""
for _c in /opt/seclists/Discovery/Web-Content/common.txt /usr/share/wordlists/dirb/common.txt; do
  if [ -f "$_c" ]; then wl="$_c"; break; fi
done
if command -v ffuf >/dev/null 2>&1 && [ -s "$d/urls.txt" ] && [ -f "$wl" ]; then
  sed -E 's#^(https?://[^/]+).*#\1#' "$d/urls.txt" | sort -u | while IFS= read -r origin; do
    [ -n "$origin" ] || continue
    safe=$(printf '%s' "$origin" | tr -c 'A-Za-z0-9' '_')
    ( export TOOL_TIMEOUT="${FFUF_TIMEOUT:-180}"
      run ffuf -u "$origin/FUZZ" -w "$wl" -t "${FFUF_THREADS:-40}" -mc 200,204,301,302,307,401,403 \
          -of json -o "$d/raw/ffuf-$safe.json" -s )
  done
else
  if ! command -v ffuf >/dev/null 2>&1; then record ffuf skipped 0 "not installed"
  elif [ ! -f "$wl" ]; then record ffuf skipped 0 "no wordlist"
  else record ffuf skipped 0 "no urls"; fi
fi

done_line "$(grep -vc '^[[:space:]]*$' "$d/urls.txt" || true) live URLs"
