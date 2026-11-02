#!/usr/bin/env bash
# Stage 60 deep: the thorough pass that runs AFTER the quick pipeline (so fast results land first).
# Full TCP (all 65535 ports) then UDP (top-200 -- full UDP is infeasible), with service + default
# scripts. Feeds merge.py's attack-surface + unusual/new-port task generators.
set -euo pipefail
OUT="${1:?output dir}"; STAGE="60 deep"
. "$(dirname "$0")/_lib.sh"
d="$OUT/60-deep"; mkdir -p "$d/raw"
live="$OUT/00-discovery/live-hosts.txt"

if [ ! -s "$live" ]; then
  record nmap skipped 0 "no live hosts"
  done_line "no live hosts; deep scan skipped"
  : > "$d/deep.done"
  exit 0
fi
n=$(grep -vc '^[[:space:]]*$' "$live" 2>/dev/null) || n=0

# 1) FULL TCP: every port, service + default scripts. --host-timeout bounds a slow host.
banner "full TCP · nmap -p- -sV · $n host(s)"
TOOL_TIMEOUT="${DEEP_TCP_TIMEOUT:-2400}" run nmap -Pn -p- -sV -sC --host-timeout "${DEEP_HOST_TIMEOUT:-20m}" \
  -iL "$live" -oX "$d/raw/nmap-tcp.xml" -oN "$d/raw/nmap-tcp.normal.txt" || true

# 2) UDP: top-200 only (full UDP would take days). -sV to identify what answers.
banner "UDP · nmap -sU --top-ports ${DEEP_UDP_PORTS:-200} · $n host(s)"
TOOL_TIMEOUT="${DEEP_UDP_TIMEOUT:-1800}" run nmap -Pn -sU -sV --top-ports "${DEEP_UDP_PORTS:-200}" \
  --host-timeout "${DEEP_HOST_TIMEOUT:-20m}" \
  -iL "$live" -oX "$d/raw/nmap-udp.xml" -oN "$d/raw/nmap-udp.normal.txt" || true

: > "$d/deep.done"
done_line "deep scan complete (full tcp + udp top-${DEEP_UDP_PORTS:-200})"
