#!/usr/bin/env bash
# Anchor launcher. Pick a throttle profile (menu if none given), then run the pipeline
# in parallel with readable, grouped output.
# Usage: ./run.sh [gentle|normal|fast] [make vars...]
#   ./run.sh gentle SUBNET=10.1.2.0/24      # named profile, no menu
#   ./run.sh                                 # interactive menu
set -euo pipefail
cd "$(dirname "$0")"

# First arg is the profile only if it names one; otherwise it's a make var and the menu shows.
case "${1:-}" in
  gentle|normal|fast) PROFILE="$1"; shift ;;
  *) PROFILE="" ;;
esac

if [ -z "$PROFILE" ]; then
  echo "Throttle profile:"
  echo "  1) gentle  ~500 pps    fragile infra"
  echo "  2) normal  ~2000 pps   default"
  echo "  3) fast    ~5000 pps   robust infra, RoE permitting"
  read -rp "choose [2]: " c
  case "$c" in 1) PROFILE=gentle ;; 3) PROFILE=fast ;; *) PROFILE=normal ;; esac
fi

# Prefer a GNU Make 4.0+ (gmake on macOS) so --output-sync can group each branch's output.
MAKE=make; command -v gmake >/dev/null 2>&1 && MAKE=gmake
major=$("$MAKE" --version 2>/dev/null | sed -n '1s/.*Make \([0-9][0-9]*\).*/\1/p')
SYNC=""
if [ "${major:-0}" -ge 4 ] 2>/dev/null; then
  SYNC="--output-sync=line"
else
  echo "note: $MAKE is ${major:-?}.x; no --output-sync, so parallel lines interleave (the [stage] tags keep them readable). brew install make for grouped output." >&2
fi
JOBS="${JOBS:-4}"

# Auto-boot the triage site, SEPARATE from the scan: start it in the background (if not already up)
# so the team can watch and triage while the scan runs and after it finishes. It self-ingests every
# ~15s, so results appear as the scan produces them. Opt out with ANCHOR_SITE=0.
PORT="${ANCHOR_PORT:-8000}"
started_site=0
if [ "${ANCHOR_SITE:-1}" = "1" ] && command -v python3 >/dev/null 2>&1 \
   && ! curl -fsS -o /dev/null "http://localhost:$PORT/" 2>/dev/null; then
  scope=$("$MAKE" -s show-scope PROFILE="$PROFILE" "$@" 2>/dev/null | tail -1 || true)
  if [ -n "$scope" ]; then
    mkdir -p "engagement/$scope"
    # if BloodHound CE is deployed (make bloodhound captured its password), wire auto-import + the link
    if [ -s docker/bloodhound/.bhce-pass ]; then   # -s: non-empty, so a failed capture never wires a blank pass
      export ANCHOR_BLOODHOUND=1 ANCHOR_BLOODHOUND_PORT="${BLOODHOUND_PORT:-8080}" \
        ANCHOR_BHCE_URL="http://localhost:${BLOODHOUND_PORT:-8080}" ANCHOR_BHCE_USER=admin \
        ANCHOR_BHCE_PASS="$(head -1 docker/bloodhound/.bhce-pass)"
    fi
    ANCHOR_SCOPE="engagement/$scope" nohup python3 site/app.py >"engagement/$scope/site.log" 2>&1 &
    started_site=1
    echo "→ triage site: http://localhost:$PORT  (scope $scope)"
  fi
fi

echo "→ $MAKE -j$JOBS $SYNC scan PROFILE=$PROFILE $*"
rc=0
"$MAKE" -j"$JOBS" $SYNC scan PROFILE="$PROFILE" "$@" || rc=$?   # set -e would abort before rc=$? otherwise

# Keep the auto-started site up after the scan so the team can keep triaging (Ctrl-C to stop).
if [ "$started_site" = 1 ]; then
  echo "scan finished (exit $rc) · triage site still up at http://localhost:$PORT — Ctrl-C to stop"
  wait
fi
exit $rc
