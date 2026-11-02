#!/usr/bin/env bash
# Build the Anchor tools image. Tagged anchor-tools:latest so compose.yaml reuses it.
# Waits for the Docker daemon if it's still coming up (Docker Desktop on macOS is slow to start).
#
# Usage: ./build.sh [--with-ad | --without-ad] [extra docker build args...]
#   --with-ad     (default) full AD toolchain (nxc/certipy/impacket); adds a Rust builder stage.
#   --without-ad  skip the AD toolchain: no Rust, lean & fast build.
set -euo pipefail
cd "$(dirname "$0")"

WITH_AD=1
case "${1:-}" in
  --with-ad)    WITH_AD=1; shift ;;
  --without-ad) WITH_AD=0; shift ;;
esac

# Wait for the daemon: up to ~2 min, then give up with a clear message.
for i in $(seq 1 24); do
  if docker info >/dev/null 2>&1; then break; fi
  [ "$i" -eq 1 ] && echo "waiting for Docker daemon..."
  [ "$i" -eq 24 ] && { echo "docker daemon not reachable after 2 min; is Docker Desktop running?" >&2; exit 1; }
  sleep 5
done

echo "→ docker build --build-arg WITH_AD=$WITH_AD -t anchor-tools:latest . $*"
docker build --build-arg "WITH_AD=$WITH_AD" -t anchor-tools:latest "$@" .
echo "✓ built anchor-tools:latest (WITH_AD=$WITH_AD)"
echo "next: docker compose up -d target && docker compose up -d anchor"
