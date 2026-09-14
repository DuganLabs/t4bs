/* Pure shaping for the admin tabs — no I/O. The D1 stores hand back rows;
   these turn them into what the tabs render, so the maths is testable and
   the SSR template and the client agree on every derived number. */

import { parFor } from "./pure.js";
import { shiftDay } from "./daily.js";

/** One catalogue row for the table: win rate, effective par, a flag the
 *  admin should look at. @param {any} row from d1Puzzles.listAllWithStats */
export function catalogueRow(row) {
  const plays = Number(row.plays) || 0;
  const wins = Number(row.wins) || 0;
  const winRate = plays > 0 ? wins / plays : null;
  const par = parFor(row);
  const avg = row.avgWinScore == null ? null : Math.round(Number(row.avgWinScore));
  /* Worth a look: enough plays to mean something, and either almost
     nobody solves it or everybody beats par by a mile. */
  const suspicious = plays >= 20 && (winRate < 0.1 || (avg !== null && avg > par * 1.5));
  return {
    id: row.id,
    category: row.category,
    phrase: row.phrase,
    anchors: row.anchors || [],
    par,
    parIsDerived: !(Number.isFinite(Number(row.par)) && Number(row.par) > 0),
    status: row.status,
    submittedBy: row.submittedBy,
    plays,
    wins,
    winRate,
    winRateLabel: winRate === null ? "—" : `${Math.round(winRate * 100)}%`,
    avgWinScore: avg,
    suspicious,
  };
}

/**
 * The schedule window: every day from `fromDay` for `days`, merged with the
 * rows the schedule holds and the completions the results table holds.
 * Days with no row read as `puzzleId: null` ("fills on first play").
 * @param {{ fromDay: string, days: number, rows: Array<{day:string,puzzleId:number,pinned:number}>,
 *           completions: Array<{day:string,plays:number,wins:number,avgWinScore:number|null}>,
 *           puzzlesById: Map<number, {category:string, phrase:string}> }} input
 */
export function scheduleWindow({ fromDay, days, rows, completions, puzzlesById }) {
  const byDay = new Map((rows || []).map(r => [r.day, r]));
  const done = new Map((completions || []).map(c => [c.day, c]));
  const out = [];
  for (let i = 0; i < days; i++) {
    const day = shiftDay(fromDay, i);
    const row = byDay.get(day) || null;
    const puzzle = row ? puzzlesById.get(Number(row.puzzleId)) || null : null;
    const c = done.get(day) || null;
    out.push({
      day,
      puzzleId: row ? Number(row.puzzleId) : null,
      pinned: !!(row && row.pinned),
      category: puzzle?.category ?? null,
      phrase: puzzle?.phrase ?? null,
      plays: c ? Number(c.plays) : 0,
      wins: c ? Number(c.wins) : 0,
      winRateLabel: c && c.plays > 0 ? `${Math.round((c.wins / c.plays) * 100)}%` : "—",
    });
  }
  return out;
}

/** The Stats tab. @param {{ totals: any, roundsByDay: any[] }} input */
export function statsSummary({ totals, roundsByDay }) {
  const t = totals || {};
  const days = (roundsByDay || []).map(r => ({
    day: r.day, rounds: Number(r.rounds) || 0, won: Number(r.won) || 0, lost: Number(r.lost) || 0,
  }));
  const last7 = days.slice(-7).reduce((n, d) => n + d.rounds, 0);
  const dailyResults = Number(t.dailyResults) || 0;
  const dailyWins = Number(t.dailyWins) || 0;
  return {
    rounds: Number(t.rounds) || 0,
    roundsLast7: last7,
    dailyResults,
    dailyWins,
    dailyWinRateLabel: dailyResults > 0 ? `${Math.round((dailyWins / dailyResults) * 100)}%` : "—",
    dailyPlayers: Number(t.dailyPlayers) || 0,
    shareCards: Number(t.shareCards) || 0,
    puzzles: Number(t.puzzles) || 0,
    pending: Number(t.pending) || 0,
    users: Number(t.users) || 0,
    days,
  };
}
