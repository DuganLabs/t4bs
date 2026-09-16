/* One place that wires the engine to its D1 stores.

   Every /api/* game endpoint used to build `createEngine({ puzzles,
   sessions })` by hand. Now that finishing a round has a side effect
   (recording the day's daily result so a streak can exist and the
   puzzle can't be replayed for score), that wiring has to be identical
   across /session, /guess, /allin and /cascade — so it lives here. */

import { createEngine } from "../../shared/engine.js";
import { d1Puzzles, d1Sessions, d1Dailies, d1Schedule } from "./d1.js";
import { playerIdentity } from "./util.js";
import { computeStreak, nextDailyPuzzleId, pickDailyPuzzleId, zonedDayKey, msUntilNextRollover } from "../../shared/daily.js";

/** Engine wired to D1, with the daily recorder attached. @param {any} env */
export function gameEngine(env) {
  const dailies = d1Dailies(env.DB);
  return createEngine({
    puzzles: d1Puzzles(env.DB),
    sessions: d1Sessions(env.DB),
    onFinish: async ({ state, outcome }) => {
      if (state.mode !== "daily" || !state.playerKey || !state.day) return;
      await dailies.record({
        playerKey: state.playerKey,
        day: state.day,
        puzzleId: state.puzzleId,
        outcome,
        score: state.score,
      });
    },
  });
}

/**
 * Which puzzle is `day`'s, from the schedule (migrations/0005): the pinned or
 * previously-filled row if there is one; otherwise the next unused puzzle in
 * the cycle, written down so every later reader agrees. A scheduled puzzle
 * that has since been retired falls through to a fresh pick rather than a
 * 503. If the table is not there at all (a deploy racing its migration),
 * the old hash keeps the day answerable.
 *
 * @param {any} env @param {number[]} approvedIds @param {string} day
 */
export async function scheduledPuzzleId(env, approvedIds, day) {
  if (approvedIds.length === 0) return null;
  const approved = new Set(approvedIds);
  try {
    const schedule = d1Schedule(env.DB);
    const row = await schedule.get(day);
    if (row && approved.has(Number(row.puzzleId))) return Number(row.puzzleId);
    const used = await schedule.usedPuzzleIds();
    const pick = nextDailyPuzzleId(approvedIds, used, day);
    if (pick === null) return null;
    if (row?.pinned) return pick;                   // pinned but retired: honour today, do not overwrite
    await schedule.set(day, pick, 0);
    const written = await schedule.get(day);
    return written && approved.has(Number(written.puzzleId)) ? Number(written.puzzleId) : pick;
  } catch {
    return pickDailyPuzzleId(approvedIds, day);
  }
}

/**
 * Today's daily, from the server's point of view: which puzzle, whether
 * this player has already finished it, and their streak.
 *
 * @param {any} env
 * @param {string} playerKey
 * @param {Date} [now]
 */
export async function dailyStatus(env, playerKey, now = new Date()) {
  const day = zonedDayKey(now);
  const puzzles = d1Puzzles(env.DB);
  const dailies = d1Dailies(env.DB);

  const [approved, history] = await Promise.all([
    puzzles.listApproved(),
    dailies.history(playerKey),
  ]);

  const ids = approved.map(p => Number(p.id));
  const puzzleId = await scheduledPuzzleId(env, ids, day);
  const meta = approved.find(p => Number(p.id) === puzzleId) || null;
  const today = history.find(r => r.day === day) || null;
  const { current, best } = computeStreak(history, day);

  return {
    day,
    puzzleId,
    category: meta?.category || null,
    submittedBy: meta?.submittedBy || null,
    playedToday: !!today,
    outcome: today?.outcome || null,
    score: today?.score ?? null,
    streak: current,
    bestStreak: best,
    daysPlayed: history.length,
    msUntilNext: msUntilNextRollover(now),
  };
}

/**
 * Attach the refreshed daily snapshot to the response that ENDED a
 * daily round. The engine's onFinish hook has already recorded the
 * result by the time this runs, so the streak it reads back is the
 * post-round one and the end-of-round card needs no second request.
 *
 * @param {Request} request @param {any} env @param {any} result
 */
export async function withDaily(request, env, result) {
  if (!result.finished || result.mode !== "daily") return result;
  try {
    const who = await playerIdentity(request, env);
    return { ...result, daily: await dailyStatus(env, who.key) };
  } catch {
    return result;                       // never fail a finished round
  }
}
