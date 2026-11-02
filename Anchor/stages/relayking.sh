#!/usr/bin/env bash
# RelayKing (Depth Security) -- NTLM-relay opportunity + coercion enumeration across the found windows
# hosts: SMB/LDAP/LDAPS/MSSQL/HTTP(S) signing, EPA, channel binding, CVE-2025-33073 relay paths, plus an
# ntlmrelayx target list. RelayKing GATES on a valid credential check (null-auth zeroes the host list),
# so this runs CREDENTIALED inside the authed AD flow (called by ad-auth), as its last step.
# Creds come from the environment (set by ad-auth): RK_USER, RK_PASS or RK_HASH (LM:NT), RK_DOMAIN, RK_DC.
set -euo pipefail
OUT="${1:?output dir}"; STAGE="50 relay"
. "$(dirname "$0")/_lib.sh"
d="$OUT/50-relay"; mkdir -p "$d/raw"
wh="${RK_TARGETS:-$OUT/00-discovery/windows-hosts.txt}"
[ -s "$wh" ] || wh="$OUT/00-discovery/hosts.txt"

if ! command -v relayking >/dev/null 2>&1; then
  record relayking skipped 0 "not installed"; done_line "relayking not installed"; exit 0
fi
if [ ! -s "$wh" ] || [ -z "${RK_USER:-}" ] || [ -z "${RK_DC:-}" ]; then
  record relayking skipped 0 "needs hosts + creds + dc"; done_line "relay enum skipped (needs creds)"; exit 0
fi

PROTO="${RELAYKING_PROTOCOLS:-smb,ldap,ldaps,mssql,http,https}"
if [ -n "${RK_HASH:-}" ]; then AUTH=(-u "$RK_USER" --hashes "$RK_HASH"); else AUTH=(-u "$RK_USER" -p "${RK_PASS:-}"); fi
[ -n "${RK_DOMAIN:-}" ] && AUTH+=(-d "$RK_DOMAIN")
EXTRA=(); [ "${RELAYKING_COERCE:-0}" = "1" ] && EXTRA+=(--coerce)
nh=$(grep -vc '^[[:space:]]*$' "$wh" 2>/dev/null || echo 0)

banner "relayking · as ${RK_DOMAIN:+$RK_DOMAIN/}$RK_USER · $PROTO · $nh host(s)"
TOOL_TIMEOUT="${RELAYKING_TIMEOUT:-600}" run relayking -t "$wh" "${AUTH[@]}" --dc-ip "$RK_DC" \
    --protocols "$PROTO" --threads "${RELAYKING_THREADS:-10}" "${EXTRA[@]}" \
    -o json --output-file "$d/raw/relayking" --gen-relay-list "$d/raw/relaytargets.txt"

[ -s "$d/raw/relayking.json" ] && cp "$d/raw/relayking.json" "$d/relayking.json"
[ -s "$d/raw/relaytargets.txt" ] && cp "$d/raw/relaytargets.txt" "$d/relaytargets.txt"
printf 'relay enum done\n' > "$d/relay.done.tmp" && mv "$d/relay.done.tmp" "$d/relay.done"
nt=0; [ -s "$d/raw/relaytargets.txt" ] && { nt=$(grep -vc '^[[:space:]]*$' "$d/raw/relaytargets.txt") || nt=0; }
done_line "relay enum complete · $nt ntlmrelayx target(s)"
