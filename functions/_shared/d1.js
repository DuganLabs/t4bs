/* D1-backed implementations of the engine stores. */

export function d1Puzzles(DB) {
  return {
    async listApproved() {
      const r = await DB.prepare(
        "SELECT id, category, submitted_by AS submittedBy FROM puzzles WHERE status='approved' ORDER BY id"
      ).all();
      return r.results || [];
    },
    async getApproved(id) {
      const row = await DB.prepare(
        "SELECT id, category, phrase, anchors, submitted_by AS submittedBy FROM puzzles WHERE id=?1 AND status='approved'"
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
    async decide(id, status, decidedBy) {
      const sub = await DB.prepare(
        "SELECT category, phrase, anchors, submitted_by AS submittedBy FROM submissions WHERE id=?1 AND status='pending'"
      ).bind(id).first();
      if (!sub) return null;
      await DB.prepare(
        "UPDATE submissions SET status=?1, decided_by=?2, decided_at=unixepoch() WHERE id=?3"
      ).bind(status, decidedBy, id).run();
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
    async create({ id, sessionId, userId, category, score, won, grid }) {
      await DB.prepare(
        `INSERT INTO share_cards (id, session_id, user_id, category, score, won, grid)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      ).bind(id, sessionId || null, userId || null, category, score, won ? 1 : 0, grid).run();
      return { id };
    },
    async get(id) {
      const r = await DB.prepare(
        `SELECT id, session_id AS sessionId, user_id AS userId, category, score, won, grid, created_at AS createdAt
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
