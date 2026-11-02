# Shared stage helpers. Caller sets OUT and STAGE, then sources this:
#   OUT="$1"; STAGE="00 discovery"; . "$(dirname "$0")/_lib.sh"
# Same stream goes to the terminal and to scan.log via tee. Color off when NO_COLOR is set
# (set NO_COLOR=1 for a plain evidence log with no ANSI codes).
: "${OUT:?OUT not set}" "${STAGE:?STAGE not set}"
# Absolute OUT so a stage that cd's elsewhere (e.g. bloodhound into raw/) doesn't break $LOG/$STATUS:
# a relative log path resolved from the new CWD fails, and under set -e + pipefail a failing tee in
# banner()/record() then aborts the whole stage.
_abs="$(cd "$OUT" 2>/dev/null && pwd)"; [ -n "$_abs" ] && OUT="$_abs"; unset _abs
LOG="$OUT/scan.log"
STATUS="$OUT/status.jsonl"
CMDS="$OUT/commands.jsonl"
# Hard per-tool timeout wrapper. Default 600s; override per call: ( export TOOL_TIMEOUT=180; run ... ).
TIMEOUT_BIN="$(command -v timeout || command -v gtimeout || true)"

if [ -z "${NO_COLOR:-}" ]; then
  HDR=$'\033[1;36m'; OKC=$'\033[1;32m'; ERR=$'\033[1;31m'; RST=$'\033[0m'
else
  HDR=; OKC=; ERR=; RST=
fi

# Stage-start banner: "▶ 00 discovery · masscan --rate 500 ..."
banner()     { printf '[%s] %s\xe2\x96\xb6 %s \xc2\xb7 %s%s\n' "$(date +%T)" "$HDR" "$STAGE" "$*" "$RST" | tee -a "$LOG"; }
# Stage-end result: "✓ 00 discovery · 24 hosts · 61 web targets"
done_line()  { printf '[%s] %s\xe2\x9c\x93 %s \xc2\xb7 %s%s\n' "$(date +%T)" "$OKC" "$STAGE" "$*" "$RST" | tee -a "$LOG"; }
# Loud red failure banner: "✗ 30 vuln · nuclei timed out after 180s"
fail_banner() { printf '[%s] %s\xe2\x9c\x97 %s \xc2\xb7 %s%s\n' "$(date +%T)" "$ERR" "$STAGE" "$*" "$RST" | tee -a "$LOG"; }

# One JSON ledger line per tool run. status in ok|failed|timeout|skipped|empty.
# ponytail: parallel stages append concurrently; short lines + O_APPEND keep them whole, no lock.
_json()  { local s="$1"; s="${s//\\/\\\\}"; s="${s//\"/\\\"}"; s="${s//$'\n'/ }"; printf '%s' "$s"; }
record() {  # record <tool> <status> <exit> [message]
  printf '{"stage":"%s","tool":"%s","status":"%s","exit":%s,"message":"%s","ts":"%s"}\n' \
    "$(_json "$STAGE")" "$(_json "$1")" "$2" "${3:-0}" "$(_json "${4:-}")" "$(date -u +%FT%TZ)" >> "$STATUS"
}

# Classify a tool's exit code -> ledger line + (on trouble) a loud banner.
_classify() {  # _classify <tool> <rc> [raw-file]
  local tool="$1" rc="$2" raw="${3:-}"
  if [ "$rc" = 124 ] || [ "$rc" = 137 ]; then
    fail_banner "$tool timed out after ${TOOL_TIMEOUT:-600}s"; record "$tool" timeout "$rc" "timed out"
  elif [ "$rc" != 0 ]; then
    fail_banner "$tool failed (exit $rc)"; record "$tool" failed "$rc" "exit $rc"
  elif [ -n "$raw" ] && [ ! -s "$raw" ]; then
    record "$tool" empty 0 "no output"
  else
    record "$tool" ok 0 ""
  fi
}

_tmo() { if [ -n "$TIMEOUT_BIN" ]; then "$TIMEOUT_BIN" -k 10 "${TOOL_TIMEOUT:-600}" "$@"; else "$@"; fi; }

# Log the ACTUAL command invoked (real args, creds and all -- loot policy: never masked) so the site
# can show the exact command that produced a finding, not a placeholder.
_logcmd() { printf '{"stage":"%s","tool":"%s","cmd":"%s","ts":"%s"}\n' \
  "$(_json "$STAGE")" "$(_json "$1")" "$(_json "$*")" "$(date -u +%FT%TZ)" >> "$CMDS"; }

# Run a tool: bounded by timeout, [stage]-tagged to terminal+log, recorded in the ledger.
# ALWAYS returns 0 -- a failed tool is recorded and never aborts the stage (self-heal).
# </dev/null: tools like httpx/nuclei read targets from stdin when it is not a TTY (always, under
# `docker compose exec -T`) and block forever; detaching stdin forces them to use -l/-u/args only.
# Tool label = first word of the command.
run() {
  local tool="$1" rc=0
  _logcmd "$@"
  { _tmo "$@" </dev/null 2>&1 | sed "s|^|[$STAGE] |" | tee -a "$LOG"; } || rc=$?
  _classify "$tool" "$rc"
  return 0
}
# Like run(), but also writes the tool's RAW (untagged) output to $1 for the parsers in merge.py.
# Usage: capture raw/nxc.txt nxc smb "$SUBNET"
capture() {
  local raw="$1"; shift
  local tool="$1" rc=0
  _logcmd "$@"
  { _tmo "$@" </dev/null 2>&1 | tee "$raw" | sed "s|^|[$STAGE] |" | tee -a "$LOG"; } || rc=$?
  _classify "$tool" "$rc" "$raw"
  return 0
}
