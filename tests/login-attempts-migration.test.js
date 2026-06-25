// Regression guard for the login_attempts migration incident.
//
// The DB-backed brute-force throttle shipped with two coupled defects that
// made every login fail on any pre-existing database:
//   1. CREATE TABLE login_attempts was added inside the version-gated migration
//      batch without bumping SCHEMA_VERSION, so databases already at v1 skipped
//      initialization and never created the table — login then threw
//      "no such table: login_attempts" → 500.
//   2. initDatabase() pruned the table via a helper that begins with
//      `await waitForDb()`, deadlocking the very migration that resolves it —
//      the process exited silently before schema_version was bumped.
//
// This test reproduces a faithful "v1 database that predates login_attempts":
// it boots once to obtain the real current schema + seeded admin, drops the
// table, rolls schema_version back to 1, then boots again and asserts a real
// HTTP login succeeds and the table/version were repaired.
//
// Run with: node --test tests/login-attempts-migration.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createClient } = require("@libsql/client");

const SERVER_PATH = path.join(__dirname, "..", "server.js");
const ADMIN_USER = "testadmin";
// Must satisfy the 14-char admin password policy (password-policy.js).
const ADMIN_PASS = "SecureTestPass123";

function startServer(env) {
  return spawn("node", [SERVER_PATH], {
    cwd: path.join(__dirname, ".."),
    env,
    stdio: ["ignore", "ignore", "ignore"],
  });
}

function stopServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const forceKill = setTimeout(() => child.kill("SIGKILL"), 8000);
    forceKill.unref?.();
    child.once("exit", () => {
      clearTimeout(forceKill);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

// Poll /api/health until the server is initialized and serving. Each probe is
// individually time-boxed so that a *deadlocked* migration (which leaves the
// init-gated health route hanging) surfaces as an overall timeout rather than a
// hung test.
async function waitForHealth(baseUrl, { deadlineMs = 20000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < deadlineMs) {
    try {
      const controller = new AbortController();
      const probeTimeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${baseUrl}/api/health`, {
        signal: controller.signal,
      });
      clearTimeout(probeTimeout);
      if (res.status === 200) return;
    } catch {
      // Connection refused while booting, or an aborted probe — keep polling.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `server at ${baseUrl} did not become healthy within ${deadlineMs}ms ` +
      `(a deadlocked or crashed migration looks exactly like this)`,
  );
}

test("login succeeds after migrating a v1 database that predates login_attempts", async () => {
  const dbPath = path.join(
    os.tmpdir(),
    `po-login-attempts-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  const dbUrl = `file:${dbPath}`;
  const port = 3096;
  const baseUrl = `http://localhost:${port}`;

  // SECURITY_LOG_PATH is intentionally left unset — security-events.js requires
  // it to resolve within ./logs/, and unset routes events to the (silenced)
  // logger instead.
  const env = {
    ...process.env,
    NODE_ENV: "test",
    DISABLE_RATE_LIMIT: "1",
    PORT: String(port),
    HOST: "127.0.0.1",
    APP_ORIGIN: baseUrl,
    ADMIN_USER,
    ADMIN_PASS,
    TURSO_DATABASE_URL: dbUrl,
    TURSO_AUTH_TOKEN: "",
    SECURITY_LOG_PATH: "",
    LOG_LEVEL: "silent",
  };

  let child;
  try {
    // Phase 1 — full initialization against a fresh DB. This produces the real
    // current schema (every table, including login_attempts at the current
    // version) and seeds the admin user, with no hand-maintained schema copy.
    child = startServer(env);
    await waitForHealth(baseUrl);
    await stopServer(child);
    child = undefined;

    // Phase 2 — regress to the pre-login_attempts v1 state: drop the throttle
    // table and roll schema_version back to 1. This is exactly a production
    // database that was last initialized before the table was introduced.
    const seed = createClient({ url: dbUrl });
    const precondition = await seed.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='login_attempts'",
    );
    assert.equal(
      precondition.rows.length,
      1,
      "fixture precondition: a full init should have created login_attempts",
    );
    await seed.execute("DROP TABLE login_attempts");
    await seed.execute({
      sql: "INSERT OR REPLACE INTO global_settings (key, value) VALUES ('schema_version', ?)",
      args: ["1"],
    });
    seed.close();

    // Phase 3 — boot against the v1-state DB. On the unfixed code this either
    // deadlocks (waitForHealth times out) or skips the migration and 500s on
    // login below. On the fixed code the migration recreates the table.
    child = startServer(env);
    await waitForHealth(baseUrl);

    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: baseUrl },
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    });
    assert.equal(
      res.status,
      200,
      `login must succeed on a migrated v1 DB (received ${res.status})`,
    );
    const body = await res.json();
    assert.equal(body.user.role, "admin");

    // Phase 4 — the migration must have repaired the schema.
    const verify = createClient({ url: dbUrl });
    const table = await verify.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='login_attempts'",
    );
    assert.equal(
      table.rows.length,
      1,
      "migration must recreate the login_attempts table",
    );
    const versionRow = await verify.execute(
      "SELECT value FROM global_settings WHERE key='schema_version'",
    );
    const version = Number(JSON.parse(versionRow.rows[0].value));
    assert.ok(
      version >= 2,
      `schema_version must advance past 1 (got ${version})`,
    );
    verify.close();
  } finally {
    await stopServer(child).catch(() => {});
    for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      fs.rmSync(f, { force: true });
    }
  }
});
