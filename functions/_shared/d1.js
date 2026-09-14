/* D1-backed implementations of the engine stores. */

export function d1Puzzles(DB) {
  return {
    async listApproved() {
      const r = await DB.prepare(
        "SELECT id, category, submitted_by AS submittedBy FROM puzzles WHERE status='approved' ORDER BY id"
      ).all();
      return r.results || [];
    },
    /* Admin: every puzzle, with what the sessions table says about it.
       plays counts every round started; wins counts finished-won; the
       average is over won rounds only, which is the number that says
       whether a puzzle is parred right. A puzzle nobody has played reads
       0 / 0 / null. */
    async listAllWithStats() {
      const r = await DB.prepare(
        `SELECT p.id, p.category, p.phrase, p.anchors, p.par, p.status,
                p.submitted_by AS submittedBy, p.created_at AS createdAt,
                COUNT(s.id) AS plays,
                SUM(CASE WHEN json_extract(s.state, '$.finished') = 'won' THEN 1 ELSE 0 END) AS wins,
                AVG(CASE WHEN json_extract(s.state, '$.finished') = 'won'
                         THEN json_extract(s.state, '$.score') END) AS avgWinScore
           FROM puzzles p
           LEFT JOIN sessions s ON s.puzzle_id = p.id
          GROUP BY p.id
          ORDER BY p.id`
      ).all();
      return (r.results || []).map(x => ({ ...x, anchors: JSON.parse(x.anchors) }));
    },
    /* Admin edit. Only the fields given change; `status` is 'approved' or
       'retired' — a retired puzzle stops being offered while every session
       and share card that references it keeps resolving. */
    async update(id, { category, phrase, anchors, par, status }) {
      const sets = []; const args = [];
      if (category !== undefined) { sets.push(`category=?${args.length + 1}`); args.push(category); }
      if (phrase !== undefined)   { sets.push(`phrase=?${args.length + 1}`);   args.push(phrase); }
      if (anchors !== undefined)  { sets.push(`anchors=?${args.length + 1}`);  args.push(JSON.stringify(anchors)); }
      if (par !== undefined)      { sets.push(`par=?${args.length + 1}`);      args.push(par === null ? null : Number(par)); }
      if (status !== undefined)   { sets.push(`status=?${args.length + 1}`);   args.push(status); }
      if (sets.length === 0) return false;
      args.push(Number(id));
      const r = await DB.prepare(`UPDATE puzzles SET ${sets.join(", ")} WHERE id=?${args.length}`).bind(...args).run();
      return (r.meta?.changes ?? 0) > 0;
    },
    /* Admin add — straight to approved, bypassing the queue. */
    async insert({ category, phrase, anchors, par, submittedBy }) {
      const r = await DB.prepare(
        "INSERT INTO puzzles (category, phrase, anchors, par, submitted_by, status) VALUES (?1, ?2, ?3, ?4, ?5, 'approved') RETURNING id"
      ).bind(category, phrase, JSON.stringify(anchors), par ?? null, submittedBy).first();
      return r.id;
    },
    async getApproved(id) {
      // `par` may be NULL — shared/pure.js parFor() derives a default then.
      const row = await DB.prepare(
        "SELECT id, category, phrase, anchors, par, submitted_by AS submittedBy FROM puzzles WHERE id=?1 AND status='approved'"
      ).bind(Number(id)).first();
      if (!row) return null;
      return { ...row, anchors: JSON.parse(row.anchors) };
    },
  };
}

export function d1Sessions(DB) {
  return {
    async create(id, state) {
      await DB.prepare(
        "INSERT INTO sessions (id, puzzle_id, state, updated_at) VALUES (?1, ?2, ?3, unixepoch())"
      ).bind(id, state.puzzleId, JSON.stringify(state)).run();
    },
    async get(id) {
      const row = await DB.prepare("SELECT state FROM sessions WHERE id=?1").bind(id).first();
      if (!row) return null;
      return JSON.parse(row.state);
    },
    async save(id, state) {
      await DB.prepare(
        "UPDATE sessions SET state=?1, updated_at=unixepoch() WHERE id=?2"
      ).bind(JSON.stringify(state), id).run();
    },
  };
}

/* Daily results — one row per (player, UTC day). The PRIMARY KEY is
   what makes the daily un-replayable for score: `record()` uses
   INSERT OR IGNORE, so a second finish on the same day is a no-op
   rather than an overwrite. */
export function d1Dailies(DB) {
  return {
    async get(playerKey, day) {
      return await DB.prepare(
        "SELECT day, puzzle_id AS puzzleId, outcome, score FROM daily_results WHERE player_key=?1 AND day=?2"
      ).bind(playerKey, day).first();
    },
    async record({ playerKey, day, puzzleId, outcome, score }) {
      await DB.prepare(
        `INSERT OR IGNORE INTO daily_results (player_key, day, puzzle_id, outcome, score)
           VALUES (?1, ?2, ?3, ?4, ?5)`
      ).bind(playerKey, day, Number(puzzleId), outcome, Number(score) || 0).run();
    },
    /* Per-day completions, for the schedule tab's past days. */
    async byDay(fromDay, toDay) {
      const r = await DB.prepare(
        `SELECT day, COUNT(*) AS plays, SUM(CASE WHEN outcome='won' THEN 1 ELSE 0 END) AS wins,
                AVG(CASE WHEN outcome='won' THEN score END) AS avgWinScore
           FROM daily_results WHERE day BETWEEN ?1 AND ?2 GROUP BY day`
      ).bind(fromDay, toDay).all();
      return r.results || [];
    },
    /* Streaks only ever walk backwards from today until they hit a gap,
       so a bounded window is plenty and keeps the read O(1)-ish. */
    async history(playerKey, limit = 400) {
      const r = await DB.prepare(
        "SELECT day, outcome, score FROM daily_results WHERE player_key=?1 ORDER BY day DESC LIMIT ?2"
      ).bind(playerKey, limit).all();
      return r.results || [];
    },
  };
}

/* The daily schedule — one row per UTC day (migrations/0005). `set` is
   INSERT OR IGNORE so two isolates filling the same day cannot disagree:
   the first write wins and the second reads it back. A pinned row is an
   admin's decision and `set` never touches one. */
export function d1Schedule(DB) {
  return {
    async get(day) {
      const row = await DB.prepare(
        "SELECT day, puzzle_id AS puzzleId, pinned FROM daily_schedule WHERE day=?1"
      ).bind(day).first();
      return row || null;
    },
    async set(day, puzzleId, pinned = 0) {
      await DB.prepare(
        "INSERT OR IGNORE INTO daily_schedule (day, puzzle_id, pinned) VALUES (?1, ?2, ?3)"
      ).bind(day, Number(puzzleId), pinned ? 1 : 0).run();
    },
    /** Admin pin: overwrite whatever the filler chose. */
    async pin(day, puzzleId) {
      await DB.prepare(
        `INSERT INTO daily_schedule (day, puzzle_id, pinned) VALUES (?1, ?2, 1)
         ON CONFLICT(day) DO UPDATE SET puzzle_id=excluded.puzzle_id, pinned=1`
      ).bind(day, Number(puzzleId)).run();
    },
    /** Every puzzle the schedule has handed out, for the no-repeat cycle. */
    async usedPuzzleIds() {
      const r = await DB.prepare("SELECT DISTINCT puzzle_id AS id FROM daily_schedule").all();
      return (r.results || []).map(x => Number(x.id));
    },
    async range(fromDay, toDay) {
      const r = await DB.prepare(
        "SELECT day, puzzle_id AS puzzleId, pinned FROM daily_schedule WHERE day BETWEEN ?1 AND ?2 ORDER BY day"
      ).bind(fromDay, toDay).all();
      return r.results || [];
    },
  };
}

export function d1Submissions(DB) {
  return {
    async create({ category, phrase, anchors, submittedBy }) {
      const r = await DB.prepare(
        "INSERT INTO submissions (category, phrase, anchors, submitted_by) VALUES (?1, ?2, ?3, ?4) RETURNING id"
      ).bind(category, phrase, JSON.stringify(anchors), submittedBy).first();
      return r.id;
    },
    async listPending() {
      const r = await DB.prepare(
        "SELECT id, category, phrase, anchors, submitted_by AS submittedBy, created_at AS createdAt FROM submissions WHERE status='pending' ORDER BY created_at"
      ).all();
      return (r.results || []).map(x => ({ ...x, anchors: JSON.parse(x.anchors) }));
    },
    /* Decided rows stay visible (T4-021): a rejection is a decision someone
       can see and revisit, not a disappearance. */
    async listDecided(limit = 100) {
      const r = await DB.prepare(
        `SELECT id, category, phrase, submitted_by AS submittedBy, status, reason,
                decided_by AS decidedBy, decided_at AS decidedAt
           FROM submissions WHERE status != 'pending'
          ORDER BY decided_at DESC LIMIT ?1`
      ).bind(limit).all();
      return r.results || [];
    },
    async decide(id, status, decidedBy, reason = null) {
      const sub = await DB.prepare(
        "SELECT category, phrase, anchors, submitted_by AS submittedBy FROM submissions WHERE id=?1 AND status='pending'"
      ).bind(id).first();
      if (!sub) return null;
      await DB.prepare(
        "UPDATE submissions SET status=?1, decided_by=?2, decided_at=unixepoch(), reason=?4 WHERE id=?3"
      ).bind(status, decidedBy, id, status === "rejected" ? (reason || null) : null).run();
      if (status === "approved") {
        await DB.prepare(
          "INSERT INTO puzzles (category, phrase, anchors, submitted_by, status) VALUES (?1, ?2, ?3, ?4, 'approved')"
        ).bind(sub.category, sub.phrase, sub.anchors, sub.submittedBy).run();
      }
      return { id, status };
    },
  };
}

export function d1Users(DB) {
  return {
    async getByHandle(handle) {
      return await DB.prepare(
        "SELECT id, handle, role FROM users WHERE handle=?1"
      ).bind(handle).first();
    },
    async getById(id) {
      return await DB.prepare(
        "SELECT id, handle, role FROM users WHERE id=?1"
      ).bind(id).first();
    },
    async create({ id, handle }) {
      await DB.prepare("INSERT INTO users (id, handle) VALUES (?1, ?2)").bind(id, handle).run();
      return { id, handle, role: "user" };
    },
    async setRole(id, role, changedBy) {
      await DB.prepare(
        "UPDATE users SET role=?1, role_changed_at=unixepoch(), role_changed_by=?2 WHERE id=?3"
      ).bind(role, changedBy || null, id).run();
    },
    async search(q, limit = 25) {
      const r = await DB.prepare(
        `SELECT id, handle, role FROM users
           WHERE handle LIKE ?1 COLLATE NOCASE
           ORDER BY handle COLLATE NOCASE
           LIMIT ?2`
      ).bind(`%${q}%`, limit).all();
      return r.results || [];
    },
    async listByRoles(roles, limit = 100) {
      const placeholders = roles.map((_, i) => `?${i + 1}`).join(",");
      const r = await DB.prepare(
        `SELECT id, handle, role, role_changed_at, role_changed_by
           FROM users WHERE role IN (${placeholders})
           ORDER BY handle COLLATE NOCASE LIMIT ?${roles.length + 1}`
      ).bind(...roles, limit).all();
      return r.results || [];
    },
  };
}

export function d1ShareCards(DB) {
  return {
    async create({ id, sessionId, userId, puzzleId, category, score, won, grid }) {
      await DB.prepare(
        `INSERT INTO share_cards (id, session_id, user_id, puzzle_id, category, score, won, grid)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
      ).bind(
        id,
        sessionId || null,
        userId || null,
        Number.isFinite(puzzleId) ? puzzleId : null,
        category,
        score,
        won ? 1 : 0,
        grid
      ).run();
      return { id };
    },
    async get(id) {
      const r = await DB.prepare(
        `SELECT id, session_id AS sessionId, user_id AS userId, puzzle_id AS puzzleId,
                category, score, won, grid, created_at AS createdAt
           FROM share_cards WHERE id=?1`
      ).bind(id).first();
      if (!r) return null;
      return { ...r, won: !!r.won };
    },
  };
}

export function d1Credentials(DB) {
  return {
    async listByUser(userId) {
      const r = await DB.prepare(
        "SELECT id, public_key AS publicKey, counter, transports FROM credentials WHERE user_id=?1"
      ).bind(userId).all();
      return (r.results || []).map(c => ({ ...c, transports: c.transports ? JSON.parse(c.transports) : undefined }));
    },
    async getById(credId) {
      const r = await DB.prepare(
        "SELECT id, user_id AS userId, public_key AS publicKey, counter, transports FROM credentials WHERE id=?1"
      ).bind(credId).first();
      if (!r) return null;
      return { ...r, transports: r.transports ? JSON.parse(r.transports) : undefined };
    },
    async create({ id, userId, publicKey, counter, transports }) {
      await DB.prepare(
        "INSERT INTO credentials (id, user_id, public_key, counter, transports) VALUES (?1,?2,?3,?4,?5)"
      ).bind(id, userId, publicKey, counter || 0, transports ? JSON.stringify(transports) : null).run();
    },
    async updateCounter(id, counter) {
      await DB.prepare("UPDATE credentials SET counter=?1 WHERE id=?2").bind(counter, id).run();
    },
  };
}

export function d1Challenges(DB) {
  return {
    async create({ challenge, userId, purpose, ttlSeconds = 300 }) {
      const expiresAt = Math.floor(Date.now()/1000) + ttlSeconds;
      await DB.prepare(
        "INSERT INTO challenges (challenge, user_id, purpose, expires_at) VALUES (?1,?2,?3,?4)"
      ).bind(challenge, userId || null, purpose, expiresAt).run();
    },
    async consume(challenge, purpose) {
      const r = await DB.prepare(
        "SELECT challenge, user_id AS userId, purpose, expires_at AS expiresAt FROM challenges WHERE challenge=?1 AND purpose=?2"
      ).bind(challenge, purpose).first();
      if (!r) return null;
      await DB.prepare("DELETE FROM challenges WHERE challenge=?1").bind(challenge).run();
      if (r.expiresAt < Math.floor(Date.now()/1000)) return null;
      return r;
    },
  };
}

export function d1UserSessions(DB) {
  return {
    async create({ id, userId, ttlSeconds }) {
      const expiresAt = Math.floor(Date.now()/1000) + ttlSeconds;
      await DB.prepare(
        "INSERT INTO user_sessions (id, user_id, expires_at) VALUES (?1,?2,?3)"
      ).bind(id, userId, expiresAt).run();
    },
    async getUser(token) {
      const r = await DB.prepare(
        `SELECT u.id AS id, u.handle AS handle, u.role AS role, s.expires_at AS expiresAt
         FROM user_sessions s JOIN users u ON u.id = s.user_id
         WHERE s.id = ?1`
      ).bind(token).first();
      if (!r) return null;
      if (r.expiresAt < Math.floor(Date.now()/1000)) return null;
      return { id: r.id, handle: r.handle, role: r.role || "user" };
    },
    async destroy(token) {
      await DB.prepare("DELETE FROM user_sessions WHERE id=?1").bind(token).run();
    },
  };
}

/* The numbers on the admin Stats tab — the table at the top of docs/PRD.md
   v2, live. Rounds per day come from sessions.created_at; the rest are
   counts the other stores already own. */
export function d1Stats(DB) {
  return {
    async roundsByDay(days = 14) {
      const r = await DB.prepare(
        `SELECT date(created_at, 'unixepoch') AS day, COUNT(*) AS rounds,
                SUM(CASE WHEN json_extract(state, '$.finished') = 'won' THEN 1 ELSE 0 END) AS won,
                SUM(CASE WHEN json_extract(state, '$.finished') = 'lost' THEN 1 ELSE 0 END) AS lost
           FROM sessions WHERE created_at >= unixepoch() - ?1 * 86400
          GROUP BY day ORDER BY day`
      ).bind(days).all();
      return r.results || [];
    },
    async totals() {
      const row = await DB.prepare(
        `SELECT (SELECT COUNT(*) FROM sessions) AS rounds,
                (SELECT COUNT(*) FROM daily_results) AS dailyResults,
                (SELECT SUM(CASE WHEN outcome='won' THEN 1 ELSE 0 END) FROM daily_results) AS dailyWins,
                (SELECT COUNT(DISTINCT player_key) FROM daily_results) AS dailyPlayers,
                (SELECT COUNT(*) FROM share_cards) AS shareCards,
                (SELECT COUNT(*) FROM puzzles WHERE status='approved') AS puzzles,
                (SELECT COUNT(*) FROM submissions WHERE status='pending') AS pending,
                (SELECT COUNT(*) FROM users) AS users`
      ).first();
      return row || {};
    },
  };
}
