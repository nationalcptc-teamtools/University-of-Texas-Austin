#!/usr/bin/env bash
# Stage 20 AD, unauthenticated: nxc null-session enum, kerbrute userenum, ldapdomaindump anon.
# Against a non-AD target this finds nothing -- it must exit clean with empty output, never error.
# Honors $SPRAY_DELAY (spray only runs once a userlist exists; pre-auth userenum has no lockout).
set -euo pipefail
OUT="${1:?output dir}"; STAGE="20 ad/unauth"
. "$(dirname "$0")/_lib.sh"
d="$OUT/20-ad"; mkdir -p "$d/raw"
wh="$OUT/00-discovery/windows-hosts.txt"

banner "nxc null · kerbrute · ldap  (spray delay ${SPRAY_DELAY:-?}s)"

if [ ! -s "$wh" ]; then
  for t in nxc ldapdomaindump kerbrute; do record "$t" skipped 0 "no windows hosts"; done
  done_line "no windows hosts; nothing to enum"
  printf 'unauth enum: no windows hosts\n' > "$d/unauth.done.tmp" && mv "$d/unauth.done.tmp" "$d/unauth.done"
  exit 0
fi

# null-session SMB: shares, users, pass policy (tolerate 'nothing found' nonzero)
if command -v nxc >/dev/null 2>&1; then
  capture "$d/raw/nxc-null-shares.txt" nxc smb "$wh" -u '' -p '' --shares
  capture "$d/raw/nxc-null-users.txt"  nxc smb "$wh" -u '' -p '' --users
else
  record nxc skipped 0 "not installed"
fi

# anonymous LDAP dump against any DC (guess domain from nxc output; skip cleanly if unknown)
domain=$(sed -n 's/.*(domain:\([^)]*\)).*/\1/p' "$OUT/00-discovery/raw/nxc-smb.txt" 2>/dev/null | head -1 || true)
if ! command -v ldapdomaindump >/dev/null 2>&1; then
  record ldapdomaindump skipped 0 "not installed"
elif [ -z "${domain:-}" ]; then
  record ldapdomaindump skipped 0 "no domain found"
else
  while IFS= read -r host; do
    [ -n "$host" ] || continue
    run ldapdomaindump -o "$d/raw/ldd-$host" "$host"
  done < "$wh"
fi

# kerberos pre-auth user enum (no lockout) when we know a domain and have a userlist
ul="/usr/share/wordlists/userlists/common-users.txt"
if ! command -v kerbrute >/dev/null 2>&1; then
  record kerbrute skipped 0 "not installed"
elif [ -z "${domain:-}" ]; then
  record kerbrute skipped 0 "no domain found"
elif [ ! -f "$ul" ]; then
  record kerbrute skipped 0 "no userlist"
else
  dc=$(head -1 "$wh")
  capture "$d/raw/kerbrute.txt" kerbrute userenum -d "$domain" --dc "$dc" "$ul"
fi

printf 'unauth enum complete\n' > "$d/unauth.done.tmp" && mv "$d/unauth.done.tmp" "$d/unauth.done"
done_line "unauth enum done (domain=${domain:-none})"
