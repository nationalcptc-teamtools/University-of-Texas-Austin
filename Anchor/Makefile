# Anchor pipeline orchestrator.
# Stages are a DAG of output files; `make -j` parallelizes independent branches.
# Flow: discovery -> (web || unauth-AD) -> vuln -> report.  Authed AD is manual, off the DAG.
# NOTE: keep comments on their own lines; a comment trailing a `VAR := value` bakes the
# spaces before the `#` into the value, which corrupts any path built from it.

# SUBNET is REQUIRED for a scan -- no default, so a forgotten subnet errors instead of
# scanning some random range. Seed specific hosts with TARGETS=... for a no-subnet delta run.
SUBNET ?=
# engagement label; defaults to cptc when unset. Override with: make SCOPE=...
SCOPE ?= cptc
# fresh run each invocation; pass RUN= to resume or target an existing run.
# ponytail: minute granularity per request; a same-minute re-run of one SCOPE collides -> pass RUN= or add %S.
RUN := $(shell date +%Y%m%d-%H%M)
OUT := engagement/$(SCOPE)/$(RUN)
STAGES := stages
BHCE_DIR := docker/bloodhound

# Throttle profile: gentle / normal / fast. Every tool's rate lives in profiles/<name>.mk (one place).
PROFILE ?= normal
ifeq ($(wildcard profiles/$(PROFILE).mk),)
$(error unknown PROFILE '$(PROFILE)'; choose one of: $(patsubst profiles/%.mk,%,$(wildcard profiles/*.mk)))
endif
include profiles/$(PROFILE).mk
export MASSCAN_RATE NUCLEI_C NUCLEI_RL NUCLEI_BS FFUF_THREADS SPRAY_DELAY

# TARGETS (optional): when set, discovery seeds the lists from it and skips the scan -- fast delta of a known host.
TARGETS ?=
export TARGETS

DISCOVERY := $(OUT)/00-discovery/hosts.txt
WEB       := $(OUT)/10-web/urls.txt
AD_UNAUTH := $(OUT)/20-ad/unauth.done
VULN      := $(OUT)/30-vuln/nuclei.json
REPORT    := $(OUT)/40-report/summary.md
DEEP      := $(OUT)/60-deep/deep.done

.PHONY: all scan quick ad-auth clean site show-scope bloodhound

# Print the resolved SCOPE (run.sh uses it to point the auto-started site at this run's engagement dir).
show-scope:
	@echo $(SCOPE)
# .DELETE_ON_ERROR: drop a half-written target if its recipe fails (backs up the tmp-then-mv in each script).
.DELETE_ON_ERROR:

# `make scan` is the operator-facing name; run.sh adds the profile menu and output-sync.
# scan = the quick pipeline (-> report) THEN the deep full-TCP/UDP pass. `make quick` stops at the report.
all scan: $(DEEP)
quick: $(REPORT)

$(DISCOVERY): | $(OUT)
	$(STAGES)/discovery.sh $(OUT) $(SUBNET)

$(WEB): $(DISCOVERY)
	$(STAGES)/web.sh $(OUT)

$(AD_UNAUTH): $(DISCOVERY)
	$(STAGES)/ad-unauth.sh $(OUT)

$(VULN): $(WEB)
	$(STAGES)/vuln.sh $(OUT)

$(REPORT): $(VULN) $(AD_UNAUTH)
	$(STAGES)/report.sh $(OUT)
	ln -sfn "$(RUN)" "engagement/$(SCOPE)/latest"

# Deep pass: full TCP (all ports) then UDP top-200, AFTER the quick report so fast results show first.
# Then re-run the report so the deep ports + attack-surface / unusual-port tasks land in this run.
$(DEEP): $(REPORT)
	$(STAGES)/deepscan.sh $(OUT)
	$(STAGES)/report.sh $(OUT)
	ln -sfn "$(RUN)" "engagement/$(SCOPE)/latest"

# Credentialed AD: manual, off the auto DAG (waits on a human credential). Reuses the windows hosts a
# prior run already found -- point it at that run with SCOPE=/RUN= and it does NOT re-discover; then it
# re-runs the report so the authed loot/findings land in that run's summary.md.
#   make ad-auth CREDS=user:pass SCOPE=<scope> RUN=<prior-run>   (pass-the-hash: CREDS=user:<NThash>)
ad-auth: $(DISCOVERY)
	@test -n "$(CREDS)" || { echo "usage: make ad-auth CREDS=user:pass SCOPE=<scope> RUN=<prior-run>"; exit 2; }
	$(STAGES)/ad-auth.sh $(OUT) "$(CREDS)"
	$(STAGES)/report.sh $(OUT)
	ln -sfn "$(RUN)" "engagement/$(SCOPE)/latest"

# Order-only prerequisite: build the run tree once, never re-trigger stages on mtime.
$(OUT):
	mkdir -p $(OUT)/00-discovery $(OUT)/10-web $(OUT)/20-ad $(OUT)/30-vuln $(OUT)/50-relay $(OUT)/40-report $(OUT)/60-deep
	touch $(OUT)/scan.log

clean:
	rm -rf engagement/$(SCOPE)

# Triage site: long-running, boots SEPARATE from the scan -- start it anytime; it ingests whatever
# 40-report output already exists and serves the team's triage queue. SCOPE picks the engagement
# (defaults to the most recently touched one). Needs flask (in the image; `pip install flask` on bare metal).
#   make site SCOPE=goad4        # a specific engagement
#   make site                    # the latest engagement
site:
	@sd="engagement/$(SCOPE)"; [ -d "$$sd" ] || sd=$$(ls -dt engagement/*/ 2>/dev/null | head -1); \
	test -n "$$sd" || { echo "no engagement dir yet; run a scan first"; exit 1; }; \
	bh="$(BHCE_DIR)/.bhce-pass"; \
	if [ -s "$$bh" ]; then port=$${BLOODHOUND_PORT:-8080}; \
	  export ANCHOR_BLOODHOUND=1 ANCHOR_BLOODHOUND_PORT="$$port" \
	    ANCHOR_BHCE_URL="http://localhost:$$port" ANCHOR_BHCE_USER=admin ANCHOR_BHCE_PASS="$$(cat $$bh)"; \
	  echo "→ BloodHound CE wired · auto-import on · graph at http://localhost:$$port"; fi; \
	echo "→ triage site · scope $$sd · http://localhost:$${ANCHOR_PORT:-8000}"; \
	ANCHOR_SCOPE="$$sd" python3 site/app.py

# BloodHound CE: deploy the graph stack (postgres + neo4j + bloodhound) beside the site, on 0.0.0.0:8080.
# Captures the generated admin password to docker/bloodhound/.bhce-pass (gitignored) so `make site` wires
# auto-import + the BloodHound link. Needs docker + the compose plugin; run with whatever privileges your
# docker requires (e.g. `sudo make bloodhound`).
bloodhound:
	cd $(BHCE_DIR) && { [ -f .env ] || cp .env.example .env; } && docker compose up -d
	@echo "→ waiting for BloodHound CE to initialize (first boot runs DB migrations)…"
	@cd $(BHCE_DIR) && for i in $$(seq 1 36); do \
	  p=$$(docker compose logs bloodhound 2>/dev/null | grep -m1 "Initial Password Set To" | grep -oE "[A-Za-z0-9]{24,}"); \
	  if [ -n "$$p" ]; then printf '%s' "$$p" > .bhce-pass; break; fi; \
	  sleep 5; \
	done; \
	p=$$(cat .bhce-pass 2>/dev/null); \
	if [ -n "$$p" ]; then echo "→ BloodHound CE: http://localhost:8080 · admin / $$p"; \
	else echo "→ BloodHound CE is up, but the initial password did not appear in ~180s (it prints only on FIRST init)."; \
	     echo "  grab it with: docker compose -f $(BHCE_DIR)/docker-compose.yml logs bloodhound | grep Password"; fi
