/* In-memory stores for local Vite dev.

   The puzzle list is no longer duplicated here: it comes from
   shared/seed-puzzles.js, the same module seed.sql is generated from,
   so the dev mock and production D1 can't drift (they had: the dev copy
   still carried the two phrases with one-letter words, and all ten rows
   carried `anchors: []`). */

import { SEED_PUZZLES } from "../shared/seed-puzzles.js";

const PUZZLES_DEV = SEED_PUZZLES.map(p => ({ ...p, anchors: p.anchors.map(a => ({ ...a })) }));

export function memoryPuzzles() {
  const list = [...PUZZLES_DEV];
  let nextId = 1000;
  return {
    async listApproved() { return list; },
    async getApproved(id) { return list.find(p => p.id === Number(id)) || null; },
    async insertApproved({ category, phrase, anchors, submittedBy }) {
      const id = nextId++;
      list.push({ id, category, phrase, anchors, submittedBy });
      return id;
    },
  };
}

export function memorySessions() {
  const map = new Map();
  return {
    async create(id, state) { map.set(id, state); },
    async get(id) { return map.get(id) || null; },
    async save(id, state) { map.set(id, state); },
  };
}

/* Submission + user stores for the local mock — minimal, in-memory. */
export function memorySubmissions(puzzlesStore) {
  const list = [];
  let nextId = 5000;
  return {
    async create(sub) { const id = nextId++; list.push({ id, status: "pending", ...sub }); return id; },
    async listPending() { return list.filter(s => s.status === "pending"); },
    async decide(id, status) {
      const s = list.find(x => x.id === id);
      if (!s) return null;
      s.status = status;
      if (status === "approved" && puzzlesStore?.insertApproved) {
        await puzzlesStore.insertApproved({
          category: s.category, phrase: s.phrase, anchors: s.anchors, submittedBy: s.submittedBy,
        });
      }
      return { id, status };
    },
  };
}

export function memoryUsers() {
  const byHandle = new Map();
  const byId = new Map();
  return {
    async getByHandle(h) { return byHandle.get(h) || null; },
    async getById(id) { return byId.get(id) || null; },
    async create({ id, handle }) {
      const u = { id, handle, createdAt: Date.now() };
      byHandle.set(handle, u); byId.set(id, u);
      return u;
    },
  };
}


/* Daily results for the dev mock — same contract as d1Dailies(). */
export function memoryDailies() {
  const rows = new Map();   // `${playerKey}|${day}` -> row
  return {
    async get(playerKey, day) { return rows.get(`${playerKey}|${day}`) || null; },
    async record({ playerKey, day, puzzleId, outcome, score }) {
      const k = `${playerKey}|${day}`;
      if (rows.has(k)) return;                    // mirrors INSERT OR IGNORE
      rows.set(k, { day, puzzleId, outcome, score: score || 0 });
    },
    async history(playerKey) {
      return [...rows.entries()]
        .filter(([k]) => k.startsWith(`${playerKey}|`))
        .map(([, v]) => v)
        .sort((a, b) => (a.day < b.day ? 1 : -1));
    },
  };
}
