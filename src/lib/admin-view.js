/* String renderers for the admin tabs (docs/PRD.md §4). Pure — both the
   SSR (src/bn/server/render.js) and the hydrated client (src/views/admin.js)
   call these with the same data, so the first paint and every repaint are
   the same markup. Built on @basenative/components' renderTable /
   renderBadge; every interpolated value is escaped here. */

import { renderBadge, renderTable } from "@basenative/components";
import { escapeAttr, escapeText } from "@basenative/runtime/shared/escape";

const pct = (n) => (n === null || n === undefined ? "—" : String(n));

/** The catalogue table. @param {Array<ReturnType<typeof import("../../shared/admin-stats.js").catalogueRow>>} rows */
export function renderCatalogueTable(rows) {
  return renderTable({
    caption: "Every puzzle, with what the sessions table says about it",
    emptyMessage: "No puzzles yet.",
    attrs: 'data-bn-region="catalogue-table"',
    columns: [
      { key: "id", label: "#", render: (v, r) => `${r.suspicious ? '<span aria-label="worth a look">⚠</span> ' : ""}${escapeText(String(v))}` },
      { key: "category", label: "Category" },
      { key: "phrase", label: "Phrase", render: (v) => `<span data-bn-cell="phrase">${escapeText(String(v))}</span>` },
      { key: "par", label: "Par", render: (v, r) => `${escapeText(String(v))}${r.parIsDerived ? ' <small title="derived from the phrase — set one to override">auto</small>' : ""}` },
      { key: "plays", label: "Plays" },
      { key: "winRateLabel", label: "Win rate" },
      { key: "avgWinScore", label: "Avg win", render: (v) => escapeText(pct(v)) },
      { key: "status", label: "Status", render: (v) => renderBadge(escapeText(String(v)), { variant: v === "approved" ? "success" : "warning" }) },
      { key: "id", label: "", render: (v, r) =>
        `<button type="button" data-bn="button" data-variant="secondary" data-size="sm" data-action="adm-edit" data-id="${escapeAttr(String(v))}">Edit</button> `
        + `<button type="button" data-bn="button" data-variant="ghost" data-size="sm" data-action="adm-status" data-id="${escapeAttr(String(v))}" data-status="${r.status === "retired" ? "approved" : "retired"}">${r.status === "retired" ? "Restore" : "Retire"}</button>` },
    ],
    rows,
  });
}

/** The Daily tab: one row per day, a pin control on days from today on.
 *  @param {Array<any>} days from scheduleWindow @param {string} today
 *  @param {Array<{id:number, category:string, phrase:string}>} options */
export function renderScheduleList(days, today, options) {
  const opts = options.map(o =>
    `<option value="${escapeAttr(String(o.id))}">${escapeText(`#${o.id} · ${o.category} · ${o.phrase}`)}</option>`).join("");
  const rows = days.map(d => {
    const past = d.day < today;
    const what = d.puzzleId
      ? `<strong>${escapeText(d.category ?? "?")}</strong> <small>#${escapeText(String(d.puzzleId))}${d.pinned ? " · pinned" : ""}</small>`
      : `<small>fills on first play</small>`;
    const result = past || d.day === today
      ? `<small>${escapeText(String(d.plays))} played · ${escapeText(d.winRateLabel)} won</small>`
      : "";
    const pin = past ? "" :
      `<label><span class="sr-only">Pin a puzzle to ${escapeText(d.day)}</span>`
      + `<select data-bn-region="pin" data-action="adm-pin" data-day="${escapeAttr(d.day)}">`
      + `<option value="">Pin…</option>${opts}</select></label>`;
    return `<li data-bn-region="day-row"${d.day === today ? " data-today" : ""}>`
      + `<time datetime="${escapeAttr(d.day)}">${escapeText(d.day)}</time> ${what} ${result} ${pin}</li>`;
  }).join("");
  return `<ol data-bn-region="schedule" role="list">${rows}</ol>`;
}

/** The Stats tab's numbers. @param {ReturnType<typeof import("../../shared/admin-stats.js").statsSummary>} s */
export function renderStatsNumbers(s) {
  const n = (v, label) => `<p data-bn-region="number"><strong>${escapeText(String(v))}</strong><small>${escapeText(label)}</small></p>`;
  const days = (s.days || []).map(d =>
    `<li><time datetime="${escapeAttr(d.day)}">${escapeText(d.day)}</time> ${escapeText(String(d.rounds))} rounds · ${escapeText(String(d.won))} won · ${escapeText(String(d.lost))} lost</li>`).join("");
  return `<div data-bn-region="numbers">`
    + n(s.roundsLast7, "rounds, last 7 days")
    + n(s.rounds, "rounds, all time")
    + n(s.dailyResults, "daily results")
    + n(s.dailyWinRateLabel, "daily win rate")
    + n(s.dailyPlayers, "daily players")
    + n(s.shareCards, "share cards")
    + n(s.puzzles, "puzzles")
    + n(s.pending, "in the queue")
    + n(s.users, "accounts")
    + `</div><ol data-bn-region="rounds-by-day" role="list">${days || "<li>No rounds in the window.</li>"}</ol>`;
}

/** Decided submissions with reasons (T4-021). */
export function renderDecidedList(items) {
  if (!items?.length) return `<p data-bn-region="status">Nothing decided yet.</p>`;
  return `<ul data-bn-region="decided" role="list">${items.map(x =>
    `<li><strong>${escapeText(x.phrase)}</strong> <small>${escapeText(x.category)} · by ${escapeText(x.submittedBy)}</small><br>`
    + `${renderBadge(escapeText(x.status), { variant: x.status === "approved" ? "success" : "error" })} `
    + `<small>${escapeText(x.decidedBy || "?")}${x.reason ? " — " + escapeText(x.reason) : ""}</small></li>`).join("")}</ul>`;
}
