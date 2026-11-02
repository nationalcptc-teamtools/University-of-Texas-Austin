# Anchor tools image — every pipeline tool on PATH, repo bind-mounted at runtime.
# Tools-only: the repo is NOT copied in (compose bind-mounts it at /anchor) so edits to
# stages/ and the Makefile need no rebuild. Builds native on arm64 / Apple Silicon.
#
# WITH_AD toggle:
#   WITH_AD=1 (default) -> full AD toolchain (nxc/certipy/impacket); needs a one-time Rust
#                          builder stage to compile aardwolf. No Rust in the final image.
#   WITH_AD=0           -> skip all of it: no Rust stage, lean & fast. AD tools absent (the
#                          stages guard each with `command -v`, so the pipeline still runs).
# Build with: docker build --build-arg WITH_AD=0 -t anchor-tools:latest .   (or ./build.sh --without-ad)
#
# Pins are ARGs so a bump is a one-line change. Versions resolved 2026-10-16.

# Global: selects the AD stage the final image copies from (see ad-build-0 / ad-build-1 below).
ARG WITH_AD=1

# ---- kerbrute: no arm64 release binary exists (ropnop/kerbrute ships only linux_amd64/386),
# so build it once in a throwaway Go stage. The final image carries NO Go toolchain.
FROM golang:1.23-bookworm AS kerbrute-build
ARG KERBRUTE_VERSION=v1.0.3
RUN go install github.com/ropnop/kerbrute@${KERBRUTE_VERSION}

# ---- AD toolchain builder (used only when WITH_AD=1) --------------------------
# NetExec's RDP dep `aardwolf` has no linux-arm64 wheel and builds a Rust crate whose Cargo.lock
# is v4 (needs cargo >= 1.78; bookworm apt cargo is 1.63). So install rustup stable here, build the
# venv, and COPY it into the final image — no Rust toolchain at runtime.
# certipy-nxc comes from PyPI (NetExec main depends on it); impacket's git URL must be passed at
# top level because pip won't follow a direct-URL dep from NetExec's own metadata.
FROM python:3.12-slim-bookworm AS ad-build-1
# NetExec main @ pinned commit (the v1.5.1 tag is broken: it pins certipy-ad, since renamed certipy-nxc).
ARG NETEXEC_REF=89a698d93dfc
ARG IMPACKET_URL=git+https://github.com/fortra/impacket
ARG CERTIPY_VERSION=5.1.0
# bloodhound-ce-python: the CE-native ingestor, so its JSON imports cleanly into BloodHound CE
# (legacy bloodhound-python output failed CE ingest). Pinned ldap3 2.10.2rc4 dodges the 2.9.1
# format_ad_timedelta crash on AD timedelta attrs (verified vs GOAD).
ARG BLOODHOUND_VERSION=1.9.1
ARG LDAP3_BH_VERSION=2.10.2rc4
# libc6-dev is a *recommends* of gcc, not a hard dep — so --no-install-recommends drops it, and
# without it there's no crti.o/Scrt1.o/stdlib.h and every C/Rust compile (aardwolf, netifaces,
# arc4) fails to link. Name it explicitly.
RUN apt-get update && apt-get install -y --no-install-recommends \
        git gcc libc6-dev libffi-dev libssl-dev pkg-config curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV CARGO_HOME=/opt/cargo RUSTUP_HOME=/opt/rustup PATH=/opt/cargo/bin:$PATH
RUN curl -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable
# nxc-venv: NetExec (nxc) + impacket scripts + certipy-nxc (a LIBRARY-only repackage NetExec needs;
# it ships no CLI). aardwolf here is why this stage needs Rust.
RUN python -m venv /opt/nxc-venv \
    && /opt/nxc-venv/bin/pip install --no-cache-dir \
         "impacket @ ${IMPACKET_URL}" \
         "git+https://github.com/Pennyw0rth/NetExec.git@${NETEXEC_REF}"
# certipy-venv: the upstream ly4k certipy-ad, which DOES ship the `certipy` CLI. Separate venv
# because certipy-ad and certipy-nxc own the same `certipy` module and would clobber each other.
# No Rust needed for this one.
RUN python -m venv /opt/certipy-venv \
    && /opt/certipy-venv/bin/pip install --no-cache-dir "certipy-ad==${CERTIPY_VERSION}"
# bloodhound-venv: the CE-native `bloodhound-ce-python` ingestor in its OWN venv so it does NOT inherit
# NetExec's ldap3 2.9.1 (which crashes collection). --pre allows the pinned ldap3 release candidate.
RUN python -m venv /opt/bloodhound-venv \
    && /opt/bloodhound-venv/bin/pip install --no-cache-dir --pre \
         "bloodhound-ce==${BLOODHOUND_VERSION}" "ldap3==${LDAP3_BH_VERSION}"
# relayking-venv: Depth Security RelayKing (NTLM-relay opportunity + coercion enumeration) in its own
# venv (its own impacket/ldap3), cloned from source (no console entrypoint -- run via relayking.py).
ARG RELAYKING_REF=master
RUN git clone --depth 1 --branch "${RELAYKING_REF}" https://github.com/depthsecurity/RelayKing-Depth.git /opt/relayking \
    && python -m venv /opt/relayking-venv \
    && /opt/relayking-venv/bin/pip install --no-cache-dir -r /opt/relayking/requirements.txt

# ---- AD "off" placeholder (used when WITH_AD=0): empty venv dirs, no Rust, no build. ----
FROM python:3.12-slim-bookworm AS ad-build-0
RUN mkdir -p /opt/nxc-venv /opt/certipy-venv /opt/bloodhound-venv /opt/relayking /opt/relayking-venv

# ---- pick the AD source stage by WITH_AD. BuildKit only builds the stage actually referenced,
# so WITH_AD=0 never triggers the Rust build above. ----
ARG WITH_AD
FROM ad-build-${WITH_AD} AS ad-src

# ---- final image -------------------------------------------------------------
# python:3.12 (not debian:bookworm's 3.11) because certipy-nxc / NetExec need >=3.12.
# Still bookworm-based, so apt has nmap/masscan/ffuf.
FROM python:3.12-slim-bookworm
ARG WITH_AD

ARG NUCLEI_VERSION=3.11.1
ARG HTTPX_VERSION=1.12.0
ARG KATANA_VERSION=1.8.0
ARG TESTSSL_VERSION=v3.2.4
# Pin the SecLists ref the dirb wordlist is pulled from.
ARG SECLISTS_REF=2024.3

ENV DEBIAN_FRONTEND=noninteractive

# apt tools: nmap/masscan/ffuf (scanners), make+git+bash (run the pipeline), curl/unzip/ca-certs
# (fetch release binaries). python3 comes from the base image.
RUN apt-get update && apt-get install -y --no-install-recommends \
        nmap masscan ffuf \
        make git bash curl unzip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ProjectDiscovery release binaries (pinned, arm64). No Go toolchain required.
RUN set -eux; \
    arch="$(dpkg --print-architecture)"; \
    case "$arch" in amd64) pdarch=amd64;; arm64) pdarch=arm64;; *) echo "unsupported arch $arch" >&2; exit 1;; esac; \
    cd /tmp; \
    for spec in \
        "nuclei:${NUCLEI_VERSION}" \
        "httpx:${HTTPX_VERSION}" \
        "katana:${KATANA_VERSION}"; do \
        name="${spec%%:*}"; ver="${spec##*:}"; \
        curl -fsSL -o "$name.zip" \
            "https://github.com/projectdiscovery/$name/releases/download/v$ver/${name}_${ver}_linux_${pdarch}.zip"; \
        unzip -o "$name.zip" "$name" -d /usr/local/bin; \
        rm -f "$name.zip"; \
    done; \
    chmod +x /usr/local/bin/nuclei /usr/local/bin/httpx /usr/local/bin/katana

# kerbrute from the build stage.
COPY --from=kerbrute-build /go/bin/kerbrute /usr/local/bin/kerbrute

# testssl.sh (git clone, pinned tag). It's a bash script; symlink onto PATH.
RUN git clone --depth 1 --branch "${TESTSSL_VERSION}" \
        https://github.com/testssl/testssl.sh.git /opt/testssl.sh \
    && ln -s /opt/testssl.sh/testssl.sh /usr/local/bin/testssl.sh

# Bake nuclei-templates into the image (vuln.sh runs nuclei with no network for templates).
# -update-templates writes the templates + the config that points nuclei at them, version-matched.
RUN nuclei -update-templates -silent || nuclei -update-templates

# Bake a small SecLists subset: dirb common.txt is enough for ffuf content discovery.
RUN mkdir -p /opt/seclists/Discovery/Web-Content \
    && curl -fsSL -o /opt/seclists/Discovery/Web-Content/common.txt \
        "https://raw.githubusercontent.com/danielmiessler/SecLists/${SECLISTS_REF}/Discovery/Web-Content/common.txt"

# AD venvs from the selected AD stage (kept last so the heavy layers above are cache-shared across
# WITH_AD values). WITH_AD=1 -> nxc-venv (NetExec+impacket) and certipy-venv (certipy); WITH_AD=0 ->
# both empty. Symlink their CLIs onto PATH, skipping python/pip AND any name already present, so the
# venvs' deps (e.g. the Python `httpx`) never shadow a scan tool (ProjectDiscovery `httpx` lives here too).
# Each venv script's shebang points at its own venv python, so they run correctly regardless of PATH.
COPY --from=ad-src /opt/nxc-venv /opt/nxc-venv
COPY --from=ad-src /opt/certipy-venv /opt/certipy-venv
COPY --from=ad-src /opt/bloodhound-venv /opt/bloodhound-venv
COPY --from=ad-src /opt/relayking /opt/relayking
COPY --from=ad-src /opt/relayking-venv /opt/relayking-venv
# nxc-venv first: it wins for shared impacket script names (secretsdump.py, ...); bloodhound-venv
# last only adds `bloodhound-python`, keeping its own ldap3 out of the others' import path.
RUN if [ "$WITH_AD" = "1" ]; then \
        for d in /opt/nxc-venv /opt/certipy-venv /opt/bloodhound-venv; do \
            for f in "$d"/bin/*; do \
                b="$(basename "$f")"; \
                case "$b" in python*|pip*|activate*) continue;; esac; \
                if [ -e "/usr/local/bin/$b" ]; then continue; fi; \
                ln -s "$f" "/usr/local/bin/$b"; \
            done; \
        done; \
        printf '#!/bin/sh\nexec /opt/relayking-venv/bin/python /opt/relayking/relayking.py "$@"\n' \
            > /usr/local/bin/relayking && chmod +x /usr/local/bin/relayking; \
        echo "AD tools linked onto PATH"; \
    else \
        echo "WITH_AD=0: AD tools omitted"; \
    fi

# fping: streaming host discovery -- prints each alive host the instant it answers, and works on
# isolated L2 lab nets where masscan can't resolve a gateway MAC. Late layer = cheap to add/rebuild.
RUN apt-get update && apt-get install -y --no-install-recommends fping && rm -rf /var/lib/apt/lists/*

# Flask for the triage site (site/app.py) -- a long-running service started separately from the scan
# (`make site`). Library only, into the base python; not the AD venvs. Cheap late layer.
RUN pip install --no-cache-dir flask==3.1.3

# Fail the build if a required tool is missing. The AD tools are required iff WITH_AD=1.
RUN set -e; \
    for t in nmap masscan ffuf nuclei httpx katana kerbrute testssl.sh fping python3 make git bash; do \
        command -v "$t" >/dev/null || { echo "MISSING required: $t" >&2; exit 1; }; \
    done; \
    if [ "$WITH_AD" = "1" ]; then \
        for t in nxc certipy secretsdump.py GetUserSPNs.py bloodhound-ce-python relayking; do \
            command -v "$t" >/dev/null || { echo "MISSING required (WITH_AD=1): $t" >&2; exit 1; }; \
        done; \
        test -f /opt/relayking/relayking.py || { echo "MISSING: /opt/relayking/relayking.py -- the relayking wrapper is created unconditionally, so 'command -v relayking' can't catch a bad upstream layout" >&2; exit 1; }; \
        echo "required tools present (incl. AD toolchain)"; \
    else \
        echo "required tools present (AD toolchain omitted)"; \
    fi

WORKDIR /anchor
CMD ["bash"]
