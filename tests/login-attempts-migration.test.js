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
// Two cases below:
//   A. A behind-version DB (schema_version rolled back to 1) migrates without
//      deadlocking and login succeeds — guards both original defects.
//   B. A DB already reporting the CURRENT schema version, with login_attempts
//      dropped, still recreates the table and logs in — guards the *class* of
//      bug (a critical table missing because a version bump was forgotten),
//      which is only possible because the CREATE batch now runs unconditionally
//      rather than behind the version gate.
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

function buildEnv({ port, dbUrl, baseUrl }) {
  // SECURITY_LOG_PATH is intentionally empty — security-events.js requires it to
  // resolve within ./logs/, and empty routes events to the (silenced) logger.
  // TURSO_DATABASE_URL is passed explicitly; dotenv does not override already-set
  // process.env vars, so the live DB in .env is never touched.
  return {
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
}

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

// Boot once against a fresh DB to obtain the real, current schema (every table,
// including login_attempts) and a seeded admin — without hand-maintaining a
// schema copy — then shut down, leaving an initialized database file.
async function buildInitializedDb(env, baseUrl) {
  const child = startServer(env);
  try {
    await waitForHealth(baseUrl);
  } finally {
    await stopServer(child);
  }
}

async function assertAdminLoginSucceeds(baseUrl) {
  const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  assert.equal(res.status, 200, `login must succeed (received ${res.status})`);
  const body = await res.json();
  assert.equal(body.user.role, "admin");
}

async function tableExists(dbUrl, name) {
  const client = createClient({ url: dbUrl });
  try {
    const res = await client.execute({
      sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      args: [name],
    });
    return res.rows.length === 1;
  } finally {
    client.close();
  }
}

function tempDbPaths(label) {
  const dbPath = path.join(
    os.tmpdir(),
    `po-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  return {
    dbPath,
    dbUrl: `file:${dbPath}`,
    cleanup() {
      for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
        fs.rmSync(f, { force: true });
      }
    },
  };
}

test("login succeeds after migrating a behind-version DB that predates login_attempts", async () => {
  const port = 3096;
  const baseUrl = `http://localhost:${port}`;
  const { dbUrl, cleanup } = tempDbPaths("login-attempts-migrate");
  const env = buildEnv({ port, dbUrl, baseUrl });
  let child;
  try {
    await buildInitializedDb(env, baseUrl);

    // Regress to the pre-login_attempts v1 state: drop the throttle table and
    // roll schema_version back to 1 — exactly a production database that was
    // last initialized before the table existed.
    assert.ok(
      await tableExists(dbUrl, "login_attempts"),
      "fixture: a full init should create login_attempts",
    );
    const seed = createClient({ url: dbUrl });
    await seed.execute("DROP TABLE login_attempts");
    await seed.execute({
      sql: "INSERT OR REPLACE INTO global_settings (key, value) VALUES ('schema_version', ?)",
      args: ["1"],
    });
    seed.close();

    // On the unfixed code this either deadlocks (waitForHealth times out) or
    // skips the migration and 500s on login.
    child = startServer(env);
    await waitForHealth(baseUrl);
    await assertAdminLoginSucceeds(baseUrl);

    assert.ok(
      await tableExists(dbUrl, "login_attempts"),
      "migration must recreate login_attempts",
    );
    const verify = createClient({ url: dbUrl });
    const versionRow = await verify.execute(
      "SELECT value FROM global_settings WHERE key='schema_version'",
    );
    verify.close();
    const version = Number(JSON.parse(versionRow.rows[0].value));
    assert.ok(
      version >= 2,
      `schema_version must advance past 1 (got ${version})`,
    );
  } finally {
    await stopServer(child).catch(() => {});
    cleanup();
  }
});

test("a missing critical table is recreated even when schema_version is already current", async () => {
  const port = 3097;
  const baseUrl = `http://localhost:${port}`;
  const { dbUrl, cleanup } = tempDbPaths("login-attempts-current");
  const env = buildEnv({ port, dbUrl, baseUrl });
  let child;
  try {
    await buildInitializedDb(env, baseUrl);

    // Drop login_attempts but LEAVE schema_version at the current value. This
    // simulates the class of bug the structural guard prevents: a table absent
    // while the database still reports an up-to-date schema version (as would
    // happen if a future table were added without bumping SCHEMA_VERSION). The
    // old version-gated code would skip the CREATE batch and never recreate it;
    // the unconditional CREATE batch must.
    const seed = createClient({ url: dbUrl });
    const versionBefore = await seed.execute(
      "SELECT value FROM global_settings WHERE key='schema_version'",
    );
    assert.equal(
      versionBefore.rows.length,
      1,
      "fixture: schema_version is set",
    );
    await seed.execute("DROP TABLE login_attempts");
    seed.close();

    child = startServer(env);
    await waitForHealth(baseUrl);
    await assertAdminLoginSucceeds(baseUrl);

    assert.ok(
      await tableExists(dbUrl, "login_attempts"),
      "the unconditional CREATE batch must recreate the table at the current version",
    );
  } finally {
    await stopServer(child).catch(() => {});
    cleanup();
  }
});
