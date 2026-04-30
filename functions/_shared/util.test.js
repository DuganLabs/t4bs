/* Unit tests for functions/_shared/util.js — HTTP response helpers
   and role / admin-handle gates. The auth-context functions
   (currentUser / requireUser / requireModerator / requireAdmin) and
   `seedAdminRole`'s D1 write are integration-territory and stay covered
   by the live Pages-Functions deploy; here we test the pure layer plus
   the guard branches that don't actually need the DB. */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  json,
  error,
  readJson,
  getRole,
  isAdmin,
  isModerator,
  adminHandles,
  seedAdminRole,
} from "./util.js";

describe("json()", () => {
  it("returns a Response with Content-Type and Cache-Control: no-store by default", async () => {
    const res = json({ ok: true });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Content-Type"), "application/json");
    assert.equal(res.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await res.json(), { ok: true });
  });

  it("respects the status argument", async () => {
    const res = json({ ok: false }, 418);
    assert.equal(res.status, 418);
  });

  it("merges extraHeaders without dropping the defaults", () => {
    const res = json({}, 200, { "X-Custom": "value" });
    assert.equal(res.headers.get("X-Custom"), "value");
    assert.equal(res.headers.get("Cache-Control"), "no-store");
    assert.equal(res.headers.get("Content-Type"), "application/json");
  });

  it("lets extraHeaders override defaults when needed", () => {
    /* Last-write-wins via spread, so a caller can intentionally swap
       Cache-Control (e.g. for a public, cacheable response). */
    const res = json({}, 200, { "Cache-Control": "public, max-age=60" });
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=60");
  });
});

describe("error()", () => {
  it("emits a 400 JSON body with { error: <message> } by default", async () => {
    const res = error("bad-input");
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "bad-input" });
  });

  it("respects the status argument", () => {
    const res = error("forbidden", 403);
    assert.equal(res.status, 403);
  });

  it("merges extra fields into the JSON body", async () => {
    const res = error("auth-required", 401, { challenge: "abc" });
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "auth-required", challenge: "abc" });
  });

  it("inherits Cache-Control: no-store from json()", () => {
    const res = error("nope", 404);
    assert.equal(res.headers.get("Cache-Control"), "no-store");
  });
});

describe("readJson()", () => {
  it("parses a valid JSON body", async () => {
    const req = new Request("http://t.local/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a: 1, b: "x" }),
    });
    assert.deepEqual(await readJson(req), { a: 1, b: "x" });
  });

  it("returns {} on parse failure (malformed JSON)", async () => {
    const req = new Request("http://t.local/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    assert.deepEqual(await readJson(req), {});
  });

  it("returns {} for an empty body", async () => {
    const req = new Request("http://t.local/", { method: "POST", body: "" });
    assert.deepEqual(await readJson(req), {});
  });
});

describe("getRole()", () => {
  it("returns the role for a known shape", () => {
    assert.equal(getRole({ role: "admin" }), "admin");
    assert.equal(getRole({ role: "moderator" }), "moderator");
    assert.equal(getRole({ role: "user" }), "user");
  });

  it("falls back to 'user' for null / undefined / missing-role", () => {
    assert.equal(getRole(null), "user");
    assert.equal(getRole(undefined), "user");
    assert.equal(getRole({}), "user");
    assert.equal(getRole({ role: "" }), "user"); // empty string is falsy
  });
});

describe("isAdmin()", () => {
  it("is true only for role === 'admin'", () => {
    assert.equal(isAdmin({ role: "admin" }), true);
    assert.equal(isAdmin({ role: "moderator" }), false);
    assert.equal(isAdmin({ role: "user" }), false);
    assert.equal(isAdmin(null), false);
    assert.equal(isAdmin(undefined), false);
    assert.equal(isAdmin({}), false);
  });
});

describe("isModerator()", () => {
  it("is true for moderator AND for admin (admin implies moderator)", () => {
    assert.equal(isModerator({ role: "admin" }), true);
    assert.equal(isModerator({ role: "moderator" }), true);
  });

  it("is false for plain user / no user / unknown roles", () => {
    assert.equal(isModerator({ role: "user" }), false);
    assert.equal(isModerator({ role: "stranger" }), false);
    assert.equal(isModerator(null), false);
    assert.equal(isModerator({}), false);
  });
});

describe("adminHandles()", () => {
  it("returns [] when ADMIN_HANDLES is missing or empty", () => {
    assert.deepEqual(adminHandles({}), []);
    assert.deepEqual(adminHandles({ ADMIN_HANDLES: "" }), []);
    assert.deepEqual(adminHandles({ ADMIN_HANDLES: "   " }), []);
  });

  it("parses a single handle", () => {
    assert.deepEqual(adminHandles({ ADMIN_HANDLES: "wmd" }), ["wmd"]);
  });

  it("splits comma-separated handles, trimming whitespace", () => {
    assert.deepEqual(
      adminHandles({ ADMIN_HANDLES: " wmd , alice ,bob" }),
      ["wmd", "alice", "bob"],
    );
  });

  it("normalizes to lowercase (matches case-insensitively against user.handle)", () => {
    assert.deepEqual(
      adminHandles({ ADMIN_HANDLES: "WMD,Alice,BOB" }),
      ["wmd", "alice", "bob"],
    );
  });

  it("drops empty entries from trailing/duplicate commas", () => {
    assert.deepEqual(
      adminHandles({ ADMIN_HANDLES: "wmd,,alice,," }),
      ["wmd", "alice"],
    );
  });
});

describe("seedAdminRole()", () => {
  /* d1Users(env.DB).setRole(...) is the only side effect — we stub it
     out via a fake env.DB whose prepare() chain is never reached
     because seedAdminRole returns early in every branch except
     "user is in seed list and not yet admin". For the one branch that
     does call setRole, we record the call and return a resolved promise. */

  function makeStubDb(setRoleCalls) {
    /* d1Users.setRole calls DB.prepare(sql).bind(...).run() — stub the
       chain. */
    return {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              run: async () => {
                setRoleCalls.push({ sql, args });
                return { success: true };
              },
              first: async () => null,
              all: async () => ({ results: [] }),
            };
          },
        };
      },
    };
  }

  it("returns the user unchanged when user is null", async () => {
    const setRoleCalls = [];
    const env = { DB: makeStubDb(setRoleCalls), ADMIN_HANDLES: "wmd" };
    const out = await seedAdminRole(env, null);
    assert.equal(out, null);
    assert.equal(setRoleCalls.length, 0);
  });

  it("returns the user unchanged when role is already 'admin'", async () => {
    const setRoleCalls = [];
    const env = { DB: makeStubDb(setRoleCalls), ADMIN_HANDLES: "wmd" };
    const user = { id: "u1", handle: "wmd", role: "admin" };
    const out = await seedAdminRole(env, user);
    assert.equal(out, user);
    assert.equal(setRoleCalls.length, 0);
  });

  it("returns the user unchanged when handle is not in the seed list", async () => {
    const setRoleCalls = [];
    const env = { DB: makeStubDb(setRoleCalls), ADMIN_HANDLES: "wmd,alice" };
    const user = { id: "u1", handle: "stranger", role: "user" };
    const out = await seedAdminRole(env, user);
    assert.equal(out, user);
    assert.equal(setRoleCalls.length, 0);
  });

  it("promotes a seeded handle to admin and returns the upgraded user", async () => {
    const setRoleCalls = [];
    const env = { DB: makeStubDb(setRoleCalls), ADMIN_HANDLES: "wmd" };
    const user = { id: "u1", handle: "wmd", role: "user" };
    const out = await seedAdminRole(env, user);
    assert.equal(out.role, "admin");
    assert.equal(out.id, "u1");
    assert.equal(out.handle, "wmd");
    assert.equal(setRoleCalls.length, 1, "DB setRole should be called exactly once");
  });

  it("does case-insensitive matching against the seed list", async () => {
    const setRoleCalls = [];
    const env = { DB: makeStubDb(setRoleCalls), ADMIN_HANDLES: "WMD" };
    const user = { id: "u1", handle: "wmd", role: "user" };
    const out = await seedAdminRole(env, user);
    assert.equal(out.role, "admin");
    assert.equal(setRoleCalls.length, 1);
  });

  it("does not downgrade a moderator who isn't in the seed list", async () => {
    /* The function should only ELEVATE; a moderator not in the seed
       list keeps their role and no DB write happens. */
    const setRoleCalls = [];
    const env = { DB: makeStubDb(setRoleCalls), ADMIN_HANDLES: "wmd" };
    const user = { id: "u2", handle: "alice", role: "moderator" };
    const out = await seedAdminRole(env, user);
    assert.equal(out, user);
    assert.equal(setRoleCalls.length, 0);
  });

  it("promotes a moderator who IS in the seed list", async () => {
    const setRoleCalls = [];
    const env = { DB: makeStubDb(setRoleCalls), ADMIN_HANDLES: "alice" };
    const user = { id: "u2", handle: "alice", role: "moderator" };
    const out = await seedAdminRole(env, user);
    assert.equal(out.role, "admin");
    assert.equal(setRoleCalls.length, 1);
  });
});
