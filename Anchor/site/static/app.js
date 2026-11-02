// Anchor Triage -- Alpine component. The server is the source of truth; this binds the JSON to the
// views and PATCHes edits back. Two views: the queue (grouped by status) and the machine tracker.
function triage() {
  return {
    view: "queue",
    findings: [], machines: [], report: [],
    prog: { running: false, pct: 0, stage: "", run: "" }, scanLog: "",
    seenF: {}, seenM: {}, newF: {}, newM: {}, firstLoad: true,   // live "new" badges
    sel: null, selData: null, noteBody: "",
    selMachine: null, selMachineData: null,
    author: localStorage.getItem("anchor_author") || "",
    statuses: ["New", "Triaging", "Confirmed", "Dismissed", "In report"],
    f: { status: "", sev: "", source: "", assignee: "", q: "" },
    noteBodyM: "",
    showExcluded: true,
    collapsed: {},
    clearFilters() { this.f = { status: "", sev: "", source: "", assignee: "", q: "" }; },

    // ---- manual host + finding creation ----
    addHostForm: false,
    nm: { ip: "", hostname: "", os: "", domain: "" },
    editM: { ip: "", hostname: "", os: "", domain: "" },
    async createMachine() {
      if (!this.nm.ip.trim() || !this.nm.os.trim()) return;   // ip + os required
      const r = await fetch("/api/machine", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: this.nm.ip.trim(), hostname: this.nm.hostname.trim(),
                               os: this.nm.os.trim(), domain: this.nm.domain.trim() }),
      });
      if (!r.ok) { alert("add host failed: " + (await r.text())); return; }
      const j = await r.json();
      this.nm = { ip: "", hostname: "", os: "", domain: "" };
      this.addHostForm = false;
      await this.refresh();
      if (j.ip) this.openMachine(j.ip);
    },
    async saveMachineInfo() {   // edit a manual host's facts (ip/hostname/os/domain)
      const e = this.editM, old = this.selMachine;
      if (!e.ip.trim() || !e.os.trim()) return;   // ip + os required
      const r = await fetch("/api/machine/" + encodeURIComponent(old), {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: e.ip.trim(), hostname: e.hostname.trim(), os: e.os.trim(), domain: e.domain.trim() }),
      });
      if (!r.ok) { alert("save failed: " + (await r.text())); return; }
      const j = await r.json();
      await this.refresh();
      await this.openMachine(j.ip || old);   // ip may have changed
    },
    newForm: false,
    nf: { type: "", sev: "info", hosts: [], pick: "", custom: "" },
    addNewHost(h) {
      h = (h || "").trim();
      if (h && !this.nf.hosts.includes(h)) this.nf.hosts.push(h);
    },
    async createFinding() {
      if (!this.nf.type.trim()) return;
      const r = await fetch("/api/finding", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: this.nf.type.trim(), severity: this.nf.sev,
                               hosts: this.nf.hosts, author: this.author || "anon" }),
      });
      const j = await r.json();
      this.nf = { type: "", sev: "info", hosts: [], pick: "", custom: "" };
      this.newForm = false;
      await this.refresh();
      if (j.id) this.open(j.id);
    },
    toggle(s) { this.collapsed[s] = !this.collapsed[s]; },

    init() {
      this.refresh();
      setInterval(() => this.refresh(), 5000);   // team sees each other's edits
    },
    async refresh() {
      try {
        this.findings = await (await fetch("/api/findings")).json();
        this.machines = await (await fetch("/api/machines")).json();
        this.report = await (await fetch("/api/report")).json();
        this.prog = await (await fetch("/api/progress")).json();
        if (this.view === "logs") this.scanLog = await (await fetch("/api/scanlog")).text();
        this._diffNew();
      } catch (e) { /* offline blip; next tick retries */ }
    },
    // flag items that appeared after the first load; the dot auto-clears after 30s
    _diffNew() {
      for (const x of this.findings) if (!this.seenF[x.id]) { this.seenF[x.id] = 1; if (!this.firstLoad) this._flag("F", x.id); }
      for (const m of this.machines) if (!this.seenM[m.ip]) { this.seenM[m.ip] = 1; if (!this.firstLoad) this._flag("M", m.ip); }
      this.firstLoad = false;
    },
    _flag(kind, id) {
      (kind === "F" ? this.newF : this.newM)[id] = 1;
      setTimeout(() => { delete (kind === "F" ? this.newF : this.newM)[id]; }, 30000);
    },
    get hasNewF() { return Object.keys(this.newF).length > 0; },
    get hasNewM() { return Object.keys(this.newM).length > 0; },
    async loadLog() { try { this.scanLog = await (await fetch("/api/scanlog")).text(); } catch (e) { /**/ } },
    logFollow: true,   // auto-scroll the log only while the viewer is at the bottom
    onLogScroll(el) { this.logFollow = el.scrollHeight - el.scrollTop - el.clientHeight < 60; },
    // split the scan log into collapsible per-stage sections (host discovery, web, AD, nuclei, report)
    get logSections() {
      const order = ["00 discovery", "10 web", "20 ad", "30 vuln", "40 report"];
      const label = { "00 discovery": "Host discovery", "10 web": "Web", "20 ad": "Active Directory",
                      "30 vuln": "Vulnerabilities (nuclei)", "40 report": "Report", "other": "Other" };
      const buckets = {}; order.forEach(o => (buckets[o] = []));
      const other = [];
      let cur = null;
      for (const line of (this.scanLog || "").split("\n")) {
        const m = line.match(/^\[\d\d:\d\d:\d\d\]\s*[▶✓✗]\s*(.+?)\s*·/) || line.match(/^\[(\d\d [^\]]+)\]/);
        if (m) { const base = m[1].split("/")[0].trim(); if (order.includes(base)) cur = base; }
        if (cur) buckets[cur].push(line); else other.push(line);
      }
      const secs = order.filter(o => buckets[o].length).map(o => ({ key: o, label: label[o], lines: buckets[o] }));
      if (other.length) secs.push({ key: "other", label: label.other, lines: other });
      return secs;
    },

    // ---- report writing aid (#step5): every non-dismissed finding ----
    get reportTodo() { return this.report.filter(f => f.status !== "In report"); },
    get reportDone() { return this.report.filter(f => f.status === "In report"); },
    async markReport(f, written) {
      f.status = written ? "In report" : "Confirmed";
      await this.patch(f.id, { status: f.status });
      this.refresh();
    },
    async dismissFromReport(f) {   // drops it from the report (status->Dismissed); deletes nothing
      await this.patch(f.id, { status: "Dismissed" });
      this.refresh();
    },

    // ---- queue (grouped by status, #5) ----
    get filtered() {
      const q = this.f.q.toLowerCase(), a = this.f.assignee.toLowerCase();
      return this.findings.filter(x =>
        (!this.f.status || x.status === this.f.status) &&
        (!this.f.sev || x.severity === this.f.sev) &&
        (!this.f.source || x.source === this.f.source) &&
        (!a || (x.assignee || "").toLowerCase().includes(a)) &&
        (!q || (x.type + " " + (x.hosts_label || "")).toLowerCase().includes(q)));
    },
    get grouped() {   // status sections in order, severity-sorted within, empty sections hidden
      const g = Object.fromEntries(this.statuses.map(s => [s, []]));
      for (const x of this.filtered) (g[x.status] || (g[x.status] = [])).push(x);
      return this.statuses.map(s => ({ status: s, items: g[s] })).filter(sec => sec.items.length);
    },
    get sources() { return [...new Set(this.findings.map(x => x.source))].sort(); },

    saveAuthor() { localStorage.setItem("anchor_author", this.author); },

    async patch(id, data) {
      await fetch("/api/finding/" + id, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
    },
    setStatus(x)   {
      // claim it: changing a still-unassigned (i.e. New) task's status assigns it to you
      if (!x.assignee && this.author) x.assignee = this.author;
      this.patch(x.id, { status: x.status, assignee: x.assignee || "" });
      if (this.selData && this.selData.id === x.id) { this.selData.status = x.status; this.selData.assignee = x.assignee; }
    },
    setAssignee(x) { this.patch(x.id, { assignee: x.assignee || "" }); },
    syncRow(d) { const r = this.findings.find(x => x.id === d.id); if (r) { r.status = d.status; r.assignee = d.assignee; } },

    async open(x, ev) {
      if (ev && ev.target.closest("select,input,button")) return;
      const id = typeof x === "string" ? x : x.id;
      this.sel = id;
      delete this.newF[id];
      this.selData = await (await fetch("/api/finding/" + id)).json();
    },
    async addNote() {
      const body = (this.noteBody || "").trim();
      if (!body) return;
      await fetch("/api/finding/" + this.sel + "/note", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author: this.author || "anon", body }),
      });
      this.noteBody = "";
      this.selData = await (await fetch("/api/finding/" + this.sel)).json();
    },
    async reingest() { await fetch("/api/ingest", { method: "POST" }); this.refresh(); },

    // ---- captured evidence (screenshots), step 3 -- works on findings AND machines ----
    async _reload(ttype, tid) {
      if (ttype === "finding") this.selData = await (await fetch("/api/finding/" + tid)).json();
      else this.selMachineData = await (await fetch("/api/machine/" + tid)).json();
    },
    async uploadImage(file, ttype, tid) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("author", this.author || "anon");
      await fetch(`/api/${ttype}/${tid}/evidence`, { method: "POST", body: fd });
      await this._reload(ttype, tid);
    },
    onPick(ev, ttype, tid) { const f = ev.target.files[0]; if (f) this.uploadImage(f, ttype, tid); ev.target.value = ""; },
    // merged notes + captured evidence (images/text) as one chronological thread
    thread(d) {
      if (!d) return [];
      const notes = (d.notes || []).map(n => ({ ...n, _t: "note" }));
      const cap = (d.captured || []).map(e => ({ ...e, _t: e.kind }));
      return [...notes, ...cap].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
    },
    // paste into the note box: an image uploads as evidence, text pastes normally
    onPasteNote(ev, ttype, tid) {
      for (const it of (ev.clipboardData && ev.clipboardData.items) || []) {
        if (it.type && it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) { ev.preventDefault(); this.uploadImage(f, ttype, tid); }
          return;
        }
      }
    },
    async delEvidence(eid, ttype, tid) {
      await fetch("/api/evidence/" + eid, { method: "DELETE" });
      await this._reload(ttype, tid);
    },

    // ---- machine tracker (#2) ----
    get visibleMachines() { return this.showExcluded ? this.machines : this.machines.filter(m => !m.excluded); },
    get nExcluded() { return this.machines.filter(m => m.excluded).length; },
    async setExcluded(m, val) {
      m.excluded = val;
      if (val && this.selMachine === m.ip) this.selMachine = null;
      await fetch("/api/machine/" + m.ip, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excluded: val }),
      });
    },

    async openMachine(ip) {
      this.selMachine = ip;
      delete this.newM[ip];
      this.selMachineData = await (await fetch("/api/machine/" + ip)).json();
      const d = this.selMachineData;
      this.editM = { ip: d.ip || "", hostname: d.hostname || "", os: d.os || "", domain: d.domain || "" };
    },
    async gotoMachine(ip) {   // from a host link in the queue -> the machine record
      if (!ip) return;
      this.view = "machines"; this.sel = null;
      await this.openMachine(ip);
    },
    async gotoFinding(id) { this.view = "queue"; this.selMachine = null; await this.open(id); },
    async addMachineNote() {
      const body = (this.noteBodyM || "").trim();
      if (!body) return;
      await fetch("/api/machine/" + this.selMachine + "/note", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author: this.author || "anon", body }),
      });
      this.noteBodyM = "";
      this.selMachineData = await (await fetch("/api/machine/" + this.selMachine)).json();
    },

    sevClass(s) { return s; },
    copy(t) {
      // navigator.clipboard is undefined on an insecure origin (teammates reach this over http://<ip>:8000,
      // not localhost), so fall back to a hidden-textarea execCommand copy.
      if (navigator.clipboard) { navigator.clipboard.writeText(t); return; }
      const ta = document.createElement("textarea");
      ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
    },
  };
}
