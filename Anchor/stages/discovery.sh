#!/usr/bin/env bash
# Stage 00 discovery: HOST DISCOVERY first (ICMP + TCP-SYN/ACK to common Windows/AD/web ports, so a
# ping-disabled/firewalled host still shows up), THEN a port scan of ONLY the live hosts -- never an
# all-ports sweep of the whole subnet (that wastes ~95% of the time on dead addresses).
# Emits hosts.txt, web-targets.txt (ip:port), windows-hosts.txt. Honors $MASSCAN_RATE.
# TARGETS set (env): skip discovery and seed the lists directly -- fast delta scan of a known host.
set -euo pipefail
OUT="${1:?output dir}"; SUBNET="${2:-unknown}"; STAGE="00 discovery"
. "$(dirname "$0")/_lib.sh"
d="$OUT/00-discovery"; mkdir -p "$d/raw"
here="$(dirname "$0")"

if [ -n "${TARGETS:-}" ]; then
  set -f   # want whitespace-splitting of TARGETS below, but NOT glob-expansion (a '*' would hit CWD); block exits 0
  banner "seed from TARGETS (scan skipped): $TARGETS"
  for f in hosts.txt web-targets.txt windows-hosts.txt; do
    printf '%s\n' $TARGETS > "$d/$f.tmp" && mv "$d/$f.tmp" "$d/$f"   # unquoted: split TARGETS into lines
  done
  done_line "seeded $(printf '%s\n' $TARGETS | grep -c .) target(s) (delta)"
  exit 0
fi

# A subnet scan is REQUIRED when no TARGETS seed was given -- never silently scan a default range.
case "$SUBNET" in
  ''|unknown) echo "[$STAGE] SUBNET is required: pass SUBNET=<cidr> (e.g. make scan SUBNET=10.0.0.0/24), or seed hosts with TARGETS=..." >&2; exit 2 ;;
esac

# Ports used ONLY to discover hosts (not the full scan). Common Windows/AD + web + ssh/winrm so a
# host with ICMP blocked still answers on one of them. Override with DISCOVERY_PORTS=...
DISC_PORTS="${DISCOVERY_PORTS:-445,135,139,3389,88,389,443,80,22,5985}"
live="$d/live-hosts.txt"

# 1) HOST DISCOVERY (streaming): announce each live host the instant it answers. fping streams the
#    ICMP-alive hosts one by one (works on isolated L2 nets, no gateway needed); masscan streams TCP
#    discoveries on routed nets; an nmap TCP-SYN sweep then catches ping-disabled hosts. Deduped.
banner "host discovery · streaming (fping ICMP + TCP $DISC_PORTS) · $SUBNET"
: > "$live"
_announce(){ while read -r _ip _how; do case "$_ip" in *[0-9].[0-9]*) : ;; *) continue ;; esac; grep -qxF "$_ip" "$live" 2>/dev/null && continue; printf '%s\n' "$_ip" >> "$live"; done_line "live host: $_ip (${_how:-up})"; done; }
set +o pipefail
{
  # fping: each ICMP-alive host the instant it replies (streams; isolated-net friendly)
  if command -v fping >/dev/null 2>&1; then
    fping -a -g "$SUBNET" 2>/dev/null | sed -u 's/[[:space:]]*$/ icmp/'
  fi
  # masscan: streams TCP discoveries on common ports (routed nets; also ping-disabled hosts).
  # Bounded with `timeout`: masscan streams every hit immediately but in some environments (notably a
  # docker-bridge veth) never self-terminates after the scan, which would stall the whole pipeline at
  # discovery. Everything open is already streamed to _announce by the time the cap fires. --wait trims
  # the post-send linger where masscan DOES honor it.
  if command -v masscan >/dev/null 2>&1; then
    timeout "${MASSCAN_DISC_TIMEOUT:-45}" \
      masscan -p"$DISC_PORTS" --rate "${MASSCAN_RATE:-2000}" --wait "${MASSCAN_WAIT:-3}" --open "$SUBNET" \
      2>"$d/raw/masscan-disc.log" \
      | sed -u -n 's#^Discovered open port [0-9]*/tcp on \([0-9.][0-9.]*\).*#\1 tcp#p'
  fi
  # nmap TCP-SYN sweep: catch ping-disabled hosts where masscan cannot run (isolated nets)
  if command -v nmap >/dev/null 2>&1; then
    nmap -sn -PS"$DISC_PORTS" -n "$SUBNET" -oG "$d/raw/hostdisc-tcp.gnmap" >/dev/null 2>&1
    awk '/Status: Up/{print $2" tcp-syn"}' "$d/raw/hostdisc-tcp.gnmap" 2>/dev/null
  fi
} | _announce
set -o pipefail
command -v fping >/dev/null 2>&1 || command -v nmap >/dev/null 2>&1 || record nmap skipped 0 "no host scanner"
sort -uV "$live" -o "$live" 2>/dev/null || true
# Never scan the scanner's own box or localhost (with --network host, hostname -I is the host's IPs),
# nor anything the operator lists in EXCLUDE_HOSTS (space/comma-separated IPs).
{ hostname -I 2>/dev/null | tr ' ' '\n'; printf '127.0.0.1\n::1\n'; printf '%s\n' "${EXCLUDE_HOSTS:-}" | tr ', ' '\n\n'; } \
  | grep -vE '^[[:space:]]*$' | sort -u > "$d/excluded.txt" 2>/dev/null || true
if [ -s "$d/excluded.txt" ] && [ -s "$live" ]; then
  grep -vxF -f "$d/excluded.txt" "$live" > "$live.tmp" 2>/dev/null && mv "$live.tmp" "$live" || true
fi
nlive=$(grep -vc '^[[:space:]]*$' "$live" 2>/dev/null) || nlive=0   # fallback OUTSIDE $() or grep's "0"+exit-1 doubles it
done_line "host discovery complete · $nlive live host(s) (self/excluded removed)"

# nothing alive -> empty outputs, stop early (no point port-scanning dead space)
if [ "${nlive:-0}" -eq 0 ]; then
  for f in hosts.txt web-targets.txt windows-hosts.txt; do : > "$d/$f"; done
  done_line "no live hosts; nothing to scan"
  exit 0
fi

# 2) PORT SCAN only the live hosts (a handful, so this is fast even with a full port range).
banner "port scan · masscan --rate ${MASSCAN_RATE:-2000} · $nlive host(s)"
ports=""
if ! command -v masscan >/dev/null 2>&1; then
  record masscan skipped 0 "not installed"
elif TOOL_TIMEOUT="${MASSCAN_TIMEOUT:-300}" run masscan -p0-65535 --rate "${MASSCAN_RATE:-2000}" --wait "${MASSCAN_WAIT:-3}" -iL "$live" -oL "$d/raw/masscan.txt"; then
  ports=$(awk '/^open/{print $3}' "$d/raw/masscan.txt" | sort -un | paste -sd, -)
fi

# 3) service/script detail on the live hosts, into the XML merge.py reads
if [ -n "$ports" ]; then
  run nmap -Pn -sV -sC -p "$ports" -iL "$live" -oX "$d/raw/nmap.xml" -oN "$d/raw/nmap.normal.txt" || true
else
  banner "masscan found nothing / unavailable; nmap top-1000 on live hosts"
  run nmap -Pn -sV -sC --top-ports 1000 -iL "$live" -oX "$d/raw/nmap.xml" -oN "$d/raw/nmap.normal.txt" || true
fi

# 4) derive hosts.txt + web-targets.txt from the XML (reuses the tested parser)
if [ -f "$d/raw/nmap.xml" ]; then
  run python3 "$here/merge.py" discovery "$d/raw/nmap.xml" "$d" || true
fi
for f in hosts.txt web-targets.txt; do [ -f "$d/$f" ] || : > "$d/$f"; done

# 5) windows inventory via nxc smb on the live hosts (raw kept for the merge; empty is fine)
if command -v nxc >/dev/null 2>&1; then
  capture "$d/raw/nxc-smb.txt" nxc smb "$live"
  awk '/^SMB/{print $2}' "$d/raw/nxc-smb.txt" 2>/dev/null | sort -u > "$d/windows-hosts.txt.tmp" \
    && mv "$d/windows-hosts.txt.tmp" "$d/windows-hosts.txt"
else
  record nxc skipped 0 "not installed"
  : > "$d/windows-hosts.txt"
fi

done_line "$(grep -vc '^[[:space:]]*$' "$d/hosts.txt" || true) hosts · $(grep -vc '^[[:space:]]*$' "$d/web-targets.txt" || true) web · $(grep -vc '^[[:space:]]*$' "$d/windows-hosts.txt" || true) windows"
