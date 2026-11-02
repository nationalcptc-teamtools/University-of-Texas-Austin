-- Anchor triage store. Two kinds of data, kept apart on purpose:
--   facts   (finding, host)        -- refreshed from 40-report on every ingest, keyed to the
--                                      scanner's stable ids; the team never edits these.
--   overlay (finding_state, note)  -- the team's triage work; ingest NEVER overwrites it.
-- Machine overlay (work_status) and evidence land in steps 4 and 3; not here yet.

CREATE TABLE IF NOT EXISTS finding (
  id             TEXT PRIMARY KEY,        -- sha1(type), from merge.py
  type           TEXT,
  severity       TEXT,
  confidence     TEXT,
  source         TEXT,
  hosts_json     TEXT,                    -- json array of host strings
  count          INTEGER,
  first_seen_run TEXT,                    -- the run that first surfaced this finding
  title          TEXT,                    -- optional display title (else the UI uses type)
  detail         TEXT                     -- optional long description (e.g. nmap output)
);

CREATE TABLE IF NOT EXISTS host (
  ip            TEXT PRIMARY KEY,
  hostname      TEXT,
  os            TEXT,
  domain        TEXT,
  ports_json    TEXT,                     -- json array of {port,proto,service,product,version}
  findings_json TEXT                      -- json array of finding ids hitting this host
);

-- Overlay. Created once per finding (INSERT OR IGNORE in ingest), owned by the team thereafter.
CREATE TABLE IF NOT EXISTS finding_state (
  id         TEXT PRIMARY KEY,            -- == finding.id
  status     TEXT NOT NULL DEFAULT 'New', -- New | Triaging | Confirmed | Dismissed | In report
  assignee   TEXT,
  updated_at TEXT
);

-- Machine overlay: exclude out-of-scope / self hosts from the tracker. Created once per host and
-- owned by the team (ingest never flips it back), same no-clobber rule as finding_state.
CREATE TABLE IF NOT EXISTS machine_state (
  ip         TEXT PRIMARY KEY,
  excluded   INTEGER NOT NULL DEFAULT 0,
  manual     INTEGER NOT NULL DEFAULT 0,  -- 1 = hand-added (no scan backing); its facts are editable
  updated_at TEXT
);

-- Append-only thread, so two analysts writing at once never clobber each other.
CREATE TABLE IF NOT EXISTS note (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT,                       -- 'finding' or 'machine'
  target_id   TEXT,
  author      TEXT,
  ts          TEXT,
  body        TEXT
);

-- Captured evidence attached to a finding OR a machine: screenshots (file on disk, path here) and
-- pasted text (request/response, the command run). Images live under <scope>/triage/evidence/<type>/<id>/.
CREATE TABLE IF NOT EXISTS evidence (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL,              -- 'finding' | 'machine'
  target_id   TEXT NOT NULL,
  kind        TEXT NOT NULL,              -- 'image' | 'text'
  path        TEXT,                       -- relative-to-scope file path (images)
  body        TEXT,                       -- the text (text evidence)
  caption     TEXT,
  author      TEXT,
  ts          TEXT
);
