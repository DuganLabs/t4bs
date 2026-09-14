import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderCatalogueTable, renderDecidedList, renderScheduleList, renderStatsNumbers } from "./admin-view.js";

const row = (o = {}) => ({
  id: 9, category: "FAIRY TALES", phrase: "HAPPILY EVER AFTER", anchors: [{ wi: 0, li: 0 }], par: 85, parIsDerived: true,
  status: "approved", submittedBy: "house", plays: 12, wins: 3, winRate: 0.25, winRateLabel: "25%", avgWinScore: 70, suspicious: false, ...o,
});

describe("renderCatalogueTable", () => {
  it("is a @basenative/components table with edit and retire controls per row", () => {
    const html = renderCatalogueTable([row()]);
    assert.match(html, /data-bn="table"/);
    assert.match(html, /data-action="adm-edit" data-id="9"/);
    assert.match(html, /data-action="adm-status" data-id="9" data-status="retired"/);
    assert.match(html, /HAPPILY EVER AFTER/);
    assert.match(html, /25%/);
  });
  it("marks a derived par and a suspicious row, and offers Restore on a retired one", () => {
    assert.match(renderCatalogueTable([row()]), /auto/);
    assert.match(renderCatalogueTable([row({ suspicious: true })]), /worth a look/);
    assert.match(renderCatalogueTable([row({ status: "retired" })]), /data-status="approved"[^>]*>Restore/);
  });
  it("escapes a hostile phrase", () => {
    const html = renderCatalogueTable([row({ phrase: "<img src=x onerror=alert(1)>" })]);
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /&lt;img/);
  });
  it("renders an empty state", () => {
    assert.match(renderCatalogueTable([]), /No puzzles yet/);
  });
});

describe("renderScheduleList", () => {
  const days = [
    { day: "2026-09-12", puzzleId: 9, pinned: false, category: "FAIRY TALES", phrase: "X", plays: 4, wins: 1, winRateLabel: "25%" },
    { day: "2026-09-13", puzzleId: null, pinned: false, category: null, phrase: null, plays: 0, wins: 0, winRateLabel: "—" },
    { day: "2026-09-14", puzzleId: 1097, pinned: true, category: "BEATLES SONGS", phrase: "HEY JUDE", plays: 0, wins: 0, winRateLabel: "—" },
  ];
  const options = [{ id: 9, category: "FAIRY TALES", phrase: "HAPPILY EVER AFTER" }];
  it("shows results for past days and a pin control only from today on", () => {
    const html = renderScheduleList(days, "2026-09-13", options);
    assert.match(html, /2026-09-12.*4 played · 25% won/s);
    assert.doesNotMatch(html, /data-day="2026-09-12"/);
    assert.match(html, /data-day="2026-09-13"/);
    assert.match(html, /data-day="2026-09-14"/);
    assert.match(html, /data-today/);
    assert.match(html, /fills on first play/);
    assert.match(html, /pinned/);
  });
});

describe("renderStatsNumbers and renderDecidedList", () => {
  it("prints every headline number", () => {
    const html = renderStatsNumbers({ rounds: 603, roundsLast7: 139, dailyResults: 1, dailyWins: 0, dailyWinRateLabel: "0%", dailyPlayers: 1, shareCards: 14, puzzles: 432, pending: 0, users: 3, days: [{ day: "2026-09-13", rounds: 5, won: 1, lost: 2 }] });
    for (const n of ["603", "139", "14", "432", "0%"]) assert.match(html, new RegExp(`>${n}<`));
    assert.match(html, /5 rounds · 1 won · 2 lost/);
  });
  it("shows the reason on a rejection, escaped", () => {
    const html = renderDecidedList([{ id: 1, phrase: "A B", category: "C", submittedBy: "x", status: "rejected", reason: "<b>dup</b>", decidedBy: "wmd" }]);
    assert.match(html, /&lt;b&gt;dup/);
    assert.doesNotMatch(html, /<b>dup/);
    assert.match(renderDecidedList([]), /Nothing decided yet/);
  });
});
