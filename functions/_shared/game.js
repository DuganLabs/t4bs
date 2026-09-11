/* One place that wires the engine to its D1 stores.

   Every /api/* game endpoint used to build `createEngine({ puzzles,
   sessions })` by hand. Now that finishing a round has a side effect
   (recording the day's daily result so a streak can exist and the
   puzzle can't be replayed for score), that wiring has to be identical
   across /session, /guess, /allin and /cascade — so it lives here. */

import { createEngine } from "../../shared/engine.js";
import { d1Puzzles, d1Sessions, d1Dailies } from "./d1.js";
import { playerIdentity } from "./util.js";
import { computeStreak, pickDailyPuzzleId, utcDayKey, msUntilNextUtcDay } from "../../shared/daily.js";

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
 * Today's daily, from the server's point of view: which puzzle, whether
 * this player has already finished it, and their streak.
 *
 * @param {any} env
 * @param {string} playerKey
 * @param {Date} [now]
 */
export async function dailyStatus(env, playerKey, now = new Date()) {
  const day = utcDayKey(now);
  const puzzles = d1Puzzles(env.DB);
  const dailies = d1Dailies(env.DB);

  const [approved, history] = await Promise.all([
    puzzles.listApproved(),
    dailies.history(playerKey),
  ]);

  const puzzleId = pickDailyPuzzleId(approved.map(p => Number(p.id)), day);
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
    msUntilNext: msUntilNextUtcDay(now),
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
