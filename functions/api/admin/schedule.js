import { json, error, readJson, requireAdmin } from "../../_shared/util.js";
import { d1Puzzles, d1Schedule, d1Dailies } from "../../_shared/d1.js";
import { scheduledPuzzleId } from "../../_shared/game.js";
import { scheduleWindow } from "../../../shared/admin-stats.js";
import { zonedDayKey, shiftDay } from "../../../shared/daily.js";

/* GET /api/admin/schedule?past=14&ahead=30
   The window the Daily tab shows. Days ahead are FILLED here, the same way
   dailyStatus fills today, so the admin sees what will run rather than a
   row of blanks — and can pin over any of them. */
export const onRequestGet = async ({ request, env }) => {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;
  const url = new URL(request.url);
  const past = Math.min(90, Math.max(0, Number(url.searchParams.get("past") ?? 14)));
  const ahead = Math.min(90, Math.max(1, Number(url.searchParams.get("ahead") ?? 30)));

  const today = zonedDayKey();
  const fromDay = shiftDay(today, -past);
  const toDay = shiftDay(today, ahead - 1);
  const puzzles = d1Puzzles(env.DB);
  const approved = await puzzles.listApproved();
  const ids = approved.map(p => Number(p.id));
  for (let i = 0; i < ahead; i++) await scheduledPuzzleId(env, ids, shiftDay(today, i));

  const [rows, completions, all] = await Promise.all([
    d1Schedule(env.DB).range(fromDay, toDay),
    d1Dailies(env.DB).byDay(fromDay, toDay),
    puzzles.listAllWithStats(),
  ]);
  const puzzlesById = new Map(all.map(p => [Number(p.id), { category: p.category, phrase: p.phrase }]));
  return json({ today, days: scheduleWindow({ fromDay, days: past + ahead, rows, completions, puzzlesById }) });
};

/* PUT /api/admin/schedule  { day, puzzleId } — pin a puzzle to a day. */
export const onRequestPut = async ({ request, env }) => {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;
  const body = await readJson(request);
  const day = String(body.day || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return error("bad-day", 400);
  if (day < zonedDayKey()) return error("day-in-past", 400);
  const puzzleId = Number(body.puzzleId);
  const p = await d1Puzzles(env.DB).getApproved(puzzleId);
  if (!p) return error("puzzle-not-found", 404);
  await d1Schedule(env.DB).pin(day, puzzleId);
  return json({ day, puzzleId, pinned: true });
};
