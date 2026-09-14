/* ADMIN view, v2 — the tool for running the game (docs/PRD.md §4).

   One route, five tabs: Catalogue (every puzzle with plays / win rate /
   average winning score; edit, retire, add), Daily (the schedule window;
   pin any puzzle to any future day), Queue (pending submissions, and the
   decided list with reject reasons — T4-021), People (roles, unchanged),
   Stats (the table at the top of the PRD, live).

   Same shape as src/bn/views/admin.js (SSR): <main data-bn-view="admin">
   with @basenative/components' tabs. The string renderers in
   lib/admin-view.js are shared with the SSR, so a repaint here is the
   same markup the server sent. Each panel is filled by innerHTML from
   those renderers and wired by event delegation on the panel, which keeps
   the page free of per-row listeners that would leak on every reload. */

import { signal, effect } from "@basenative/runtime";
import { initTabs, renderTabs } from "@basenative/components";
import { renderAdminQueueList, renderAdminUserList } from "@basenative/admin/components";
import { bnAlert, bnButton, h } from "../lib/dom.js";
import { bindHidden, bindText } from "../lib/bind.js";
import { api } from "../lib/api.js";
import {
  renderCatalogueTable, renderDecidedList, renderScheduleList, renderStatsNumbers,
} from "../lib/admin-view.js";

const LABELS = {
  search: "Search users by handle…",
  currentSection: "Moderators & admins",
  resultsSection: "Search results",
  none: "none yet — search above to promote someone.",
};

export function createAdmin({ currentHandle, toaster, goLobby }) {
  const err = signal(null);
  const fail = (e) => { err.set(String(e?.data?.detail || e?.message || e)); toaster(String(e?.message || e), "bad"); };

  const errAlert = bnAlert({ variant: "error" });
  bindText(errAlert.content, () => err() || "");
  bindHidden(errAlert.el, () => !err());

  /* ── Catalogue ────────────────────────────────────────────────────── */
  const catalogue = signal(null);
  const editing = signal(null);           // a catalogue row, or null
  const loadCatalogue = () => api.adminCatalogue().then(catalogue.set).catch(fail);

  const catTable = h("div", { "data-bn-region": "scroll" });
  effect(() => {
    const rows = catalogue();
    catTable.innerHTML = rows === null
      ? `<p data-bn-region="status" role="status" aria-live="polite">Loading the catalogue…</p>`
      : renderCatalogueTable(rows);
  });
  catTable.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (btn.dataset.action === "adm-edit") {
      editing.set((catalogue() || []).find(r => r.id === id) || null);
      queueMicrotask(() => editForm.querySelector("input")?.focus());
    } else if (btn.dataset.action === "adm-status") {
      const status = btn.dataset.status;
      if (status === "retired" && !window.confirm(`Retire #${id}? It stops being offered; nothing is deleted.`)) return;
      try { await api.adminEditPuzzle(id, { status }); toaster(status === "retired" ? "RETIRED" : "RESTORED", "good"); loadCatalogue(); }
      catch (e2) { fail(e2); }
    }
  });

  /* Edit / add form. One form, two modes: `editing` set → PATCH that row;
     null → POST a new puzzle. Anchors are a compact "wi:li, wi:li" field
     because that is how the seed stores them and an admin editing par is
     not going to want a tile picker in the way. */
  const f = {
    category: h("input", { type: "text", name: "category", required: "", maxlength: "30" }),
    phrase:   h("input", { type: "text", name: "phrase", required: "", maxlength: "60", autocapitalize: "characters" }),
    anchors:  h("input", { type: "text", name: "anchors", placeholder: "0:0, 2:1 — blank = suggest" }),
    par:      h("input", { type: "number", name: "par", min: "1", step: "5", placeholder: "auto" }),
  };
  const formTitle = h("strong", { "data-bn-span": "2" });
  bindText(formTitle, () => editing() ? `Editing #${editing().id}` : "Add a puzzle (straight to the catalogue)");
  effect(() => {
    const r = editing();
    f.category.value = r?.category ?? "";
    f.phrase.value = r?.phrase ?? "";
    f.anchors.value = r ? r.anchors.map(a => `${a.wi}:${a.li}`).join(", ") : "";
    f.par.value = r && !r.parIsDerived ? String(r.par) : "";
  });
  const parseAnchors = (s) => s.split(",").map(x => x.trim()).filter(Boolean).map(x => {
    const [wi, li] = x.split(":").map(Number); return { wi, li };
  });
  const editForm = h("form", { "data-bn-region": "edit-form", novalidate: "" },
    formTitle,
    h("label", null, "Category", f.category),
    h("label", null, "Phrase", f.phrase),
    h("label", null, "Anchors", f.anchors),
    h("label", null, "Par", f.par),
    h("div", { "data-bn-span": "2" },
      bnButton("Save", { variant: "primary", type: "submit", attrs: 'data-bn-action="adm-save"' }),
      " ",
      bnButton("Clear", { variant: "ghost", type: "button", onClick: () => editing.set(null) }),
    ),
  );
  editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fields = {
      category: f.category.value.trim(),
      phrase: f.phrase.value.trim(),
      par: f.par.value === "" ? null : Number(f.par.value),
    };
    const anchors = parseAnchors(f.anchors.value);
    if (anchors.length) fields.anchors = anchors;
    try {
      if (editing()) await api.adminEditPuzzle(editing().id, fields);
      else await api.adminAddPuzzle(fields);
      toaster(editing() ? "SAVED" : "ADDED", "great");
      editing.set(null);
      loadCatalogue();
    } catch (e2) { fail(e2); }
  });

  /* ── Daily ────────────────────────────────────────────────────────── */
  const schedule = signal(null);
  const loadSchedule = () => api.adminSchedule(14, 30).then(schedule.set).catch(fail);
  const daily = h("div", { "data-bn-region": "tab-body" });
  effect(() => {
    const s = schedule();
    const rows = catalogue();
    if (!s) { daily.innerHTML = `<p data-bn-region="status" role="status">Loading the schedule…</p>`; return; }
    const options = (rows || []).filter(r => r.status === "approved").map(r => ({ id: r.id, category: r.category, phrase: r.phrase }));
    daily.innerHTML = `<p>Past 14 days and the next 30. A day with no row fills itself on first play; pin one to override.</p>`
      + renderScheduleList(s.days, s.today, options);
  });
  daily.addEventListener("change", async (e) => {
    const sel = e.target.closest('select[data-action="adm-pin"]');
    if (!sel || !sel.value) return;
    try { await api.adminPin(sel.dataset.day, Number(sel.value)); toaster(`PINNED · ${sel.dataset.day}`, "great"); loadSchedule(); }
    catch (e2) { fail(e2); sel.value = ""; }
  });

  /* ── Queue ────────────────────────────────────────────────────────── */
  const pending = signal(null);
  const decided = signal(null);
  const loadQueue = () => Promise.all([api.modPending().then(pending.set), api.modDecided().then(decided.set)]).catch(fail);
  const queue = h("div", { "data-bn-region": "tab-body" });
  effect(() => {
    const p = pending(), d = decided();
    queue.innerHTML = (p === null ? `<p data-bn-region="status" role="status">Loading the queue…</p>`
      : renderAdminQueueList({ items: p, actionHandler: "mod-decide" }))
      + `<h3>Decided</h3>` + (d === null ? "" : renderDecidedList(d));
  });
  queue.addEventListener("click", async (e) => {
    const btn = e.target.closest('button[data-action="mod-decide"]');
    if (!btn) return;
    const id = Number(btn.dataset.id), status = btn.dataset.decision;
    let reason = "";
    if (status === "rejected") {
      reason = (window.prompt("Reject this phrase? Say why — it is recorded on the decision.", "") || "").trim();
      if (!reason) { toaster("NOT REJECTED — no reason given", "bad"); return; }
    }
    try { await api.modDecide(id, status, reason); toaster(status === "approved" ? "APPROVED" : "REJECTED", status === "approved" ? "great" : "bad"); loadQueue(); loadCatalogue(); }
    catch (e2) { fail(e2); }
  });

  /* ── People (unchanged behaviour) ─────────────────────────────────── */
  const elevated = signal(null);
  const q = signal("");
  const results = signal(null);
  const loadElevated = () => api.modUsers("").then(elevated.set).catch(fail);
  let timer = null;
  effect(() => {
    const term = q().trim();
    if (timer) clearTimeout(timer);
    if (!term) { results.set(null); return; }
    timer = setTimeout(() => { api.modUsers(term).then(results.set).catch(fail); }, 200);
  });
  async function setRole(u, role) {
    if (u.handle === currentHandle && role === "user") {
      if (!window.confirm("Demote yourself? You'll lose access immediately.")) return;
    }
    try {
      await api.modPromote(u.id, role);
      toaster(role === "user" ? "DEMOTED" : role.toUpperCase(), role === "user" ? "bad" : "great");
      loadElevated();
      const term = q().trim();
      if (term) api.modUsers(term).then(results.set).catch(() => {});
    } catch (e2) { fail(e2); }
  }
  const search = h("input", {
    class: "bn-admin-search", type: "search", placeholder: LABELS.search, "aria-label": LABELS.search,
    autocorrect: "off", autocapitalize: "off", onInput: (e) => q.set(e.target.value),
  });
  const lists = h("section", { "aria-label": LABELS.currentSection });
  effect(() => {
    const r = results(), u = elevated();
    if (u === null) { lists.innerHTML = `<p data-bn-region="status" role="status" aria-live="polite">loading…</p>`; return; }
    const tmp = document.createElement("div");
    tmp.innerHTML = renderAdminUserList({
      users: u, results: r, query: "", currentHandle: currentHandle || "",
      labels: LABELS, actionHandler: "adm-set-role", searchHandler: "adm-search",
    });
    const bn = tmp.firstElementChild;
    bn?.querySelector(".bn-admin-search-wrap")?.remove();
    lists.innerHTML = bn ? bn.innerHTML : "";
  });
  lists.addEventListener("click", (e) => {
    const btn = e.target.closest('button[data-action="adm-set-role"]');
    if (!btn) return;
    const all = [...(elevated() || []), ...(results() || [])];
    const user = all.find(x => x.id === btn.dataset.userId) || { id: btn.dataset.userId, handle: btn.dataset.handle, role: "" };
    setRole(user, btn.dataset.role);
  });
  const people = h("div", { "data-bn-region": "tab-body" },
    h("section", { class: "bn-admin", "aria-label": "Moderator administration" },
      h("label", { class: "bn-admin-search-wrap" }, h("span", { class: "bn-sr-only" }, LABELS.search), search),
      lists,
    ),
  );

  /* ── Stats ────────────────────────────────────────────────────────── */
  const stats = signal(null);
  const loadStats = () => api.adminStats().then(stats.set).catch(fail);
  const statsEl = h("div", { "data-bn-region": "tab-body" });
  effect(() => {
    const s = stats();
    statsEl.innerHTML = s ? renderStatsNumbers(s) : `<p data-bn-region="status" role="status">Loading the numbers…</p>`;
  });

  /* ── Tabs ─────────────────────────────────────────────────────────── */
  const tabsHost = h("div", { html: renderTabs({
    id: "admin-tabs",
    attrs: 'data-bn-region="admin-tabs"',
    tabs: [
      { id: "catalogue", label: "Catalogue" },
      { id: "daily", label: "Daily" },
      { id: "queue", label: "Queue" },
      { id: "people", label: "People" },
      { id: "stats", label: "Stats" },
    ],
  }) });
  const panel = (id) => tabsHost.querySelector(`#admin-tabs-panel-${id}`);
  panel("catalogue").append(h("div", { "data-bn-region": "tab-body" }, editForm, catTable));
  panel("daily").append(daily);
  panel("queue").append(queue);
  panel("people").append(people);
  panel("stats").append(statsEl);

  /* Each tab loads what it shows the first time it is opened; the
     catalogue loads at once because it is the landing tab and the Daily
     tab's pin options come from it. */
  const loaded = new Set();
  const loadFor = (id) => {
    if (loaded.has(id)) return;
    loaded.add(id);
    ({ daily: loadSchedule, queue: loadQueue, people: loadElevated, stats: loadStats })[id]?.();
  };
  loadCatalogue();
  queueMicrotask(() => {
    const root = tabsHost.querySelector('[data-bn="tabs"]');
    if (root) initTabs(root, { onChange: (id) => loadFor(id) });
  });

  const tagline = h("p", { "data-bn-region": "tagline" });
  bindText(tagline, () => {
    const n = catalogue()?.length;
    return n == null ? "Admin" : `${n} puzzles in the catalogue · docs/PRD.md §4`;
  });

  return h("main", { "aria-labelledby": "admin-title", "data-bn-view": "admin" },
    h("header", null,
      h("h1", { id: "admin-title", class: "sr-only" }, "Admin"),
      h("p", { "data-bn-region": "sticky", "data-bn-variant": "narrow" }, "Admin"),
      tagline,
    ),
    errAlert.el,
    tabsHost,
    bnButton("Go to the puzzle lobby →", {
      variant: "secondary",
      attrs: 'data-bn-variant="leave" data-bn-action="to-lobby" aria-label="Leave admin and go to the puzzle lobby"',
      onClick: goLobby,
    }),
  );
}
