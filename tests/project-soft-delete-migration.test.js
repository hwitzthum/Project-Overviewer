// Regression guard for the project soft-delete migration (SCHEMA_VERSION 3).
//
// Two coupled risks are covered here, both of the class that produced the
// login_attempts incident — a column added to CREATE TABLE with no back-fill
// for databases that already exist:
//
//   1. projects.deleted_at. Every project read now filters on it, so a database
//      that skipped the ALTER would fail with "no such column: deleted_at" on
//      literally every project query.
//   2. projects.status_changed_at. This one was already broken in production:
//      the column was added to CREATE TABLE without an ALTER, and updateProject
//      writes it on every status change, so any database created before it
//      existed returned 500 on "move project to in-progress".
//
// The behavioural half then asserts the guarantee the soft delete exists for:
// DELETE hides the project but keeps the row, restore brings it back with the
// SAME task ids (the old client-side snapshot replay could not), and purge is
// the only thing that actually destroys data.
//
// Run with: node --test tests/project-soft-delete-migration.test.js

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

async function buildInitializedDb(env, baseUrl) {
  const child = startServer(env);
  try {
    await waitForHealth(baseUrl);
  } finally {
    await stopServer(child);
  }
}

// The login endpoint deliberately keeps the token out of the JSON body — it
// ships only in the HttpOnly session_token cookie — so pull it from Set-Cookie,
// the same way tests/e2e/helpers.js does.
function extractSessionToken(res) {
  const raw = res.headers.getSetCookie?.() || [];
  for (const cookie of raw) {
    for (const part of cookie.split(";")) {
      const trimmed = part.trim();
      if (trimmed.startsWith("session_token=")) {
        return decodeURIComponent(trimmed.slice("session_token=".length));
      }
    }
  }
  return undefined;
}

async function login(baseUrl) {
  const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  assert.equal(res.status, 200, `login must succeed (received ${res.status})`);
  const token = extractSessionToken(res);
  assert.ok(token, "login must set a session_token cookie");
  return token;
}

function authed(token, extra = {}) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}

async function projectColumns(dbUrl) {
  const client = createClient({ url: dbUrl });
  try {
    const res = await client.execute("PRAGMA table_info(projects)");
    return new Set(res.rows.map((r) => r.name));
  } finally {
    client.close();
  }
}

async function rawProjectRow(dbUrl, id) {
  const client = createClient({ url: dbUrl });
  try {
    const res = await client.execute({
      sql: "SELECT id, deleted_at FROM projects WHERE id = ?",
      args: [id],
    });
    return res.rows[0] || null;
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

test("a pre-v3 database migrates, and status changes stop 500ing", async () => {
  const port = 3094;
  const baseUrl = `http://localhost:${port}`;
  const { dbUrl, cleanup } = tempDbPaths("soft-delete-migrate");
  const env = buildEnv({ port, dbUrl, baseUrl });
  let child;
  try {
    await buildInitializedDb(env, baseUrl);

    // Regress to a genuine pre-v3 database: strip both columns the migration is
    // responsible for and roll schema_version back to 2.
    const seed = createClient({ url: dbUrl });
    // The partial index references deleted_at; SQLite refuses to drop a column
    // an index still depends on.
    await seed.execute("DROP INDEX IF EXISTS idx_projects_deleted_at");
    await seed.execute("ALTER TABLE projects DROP COLUMN deleted_at");
    await seed.execute("ALTER TABLE projects DROP COLUMN status_changed_at");
    await seed.execute({
      sql: "INSERT OR REPLACE INTO global_settings (key, value) VALUES ('schema_version', ?)",
      args: ["2"],
    });
    seed.close();

    const before = await projectColumns(dbUrl);
    assert.ok(!before.has("deleted_at"), "fixture: deleted_at must be gone");
    assert.ok(
      !before.has("status_changed_at"),
      "fixture: status_changed_at must be gone",
    );

    child = startServer(env);
    await waitForHealth(baseUrl);

    const after = await projectColumns(dbUrl);
    assert.ok(after.has("deleted_at"), "migration must add deleted_at");
    assert.ok(
      after.has("status_changed_at"),
      "migration must back-fill status_changed_at",
    );

    // Reads work at all (guards "no such column: deleted_at").
    const token = await login(baseUrl);
    const list = await fetch(`${baseUrl}/api/v1/projects`, {
      headers: authed(token),
    });
    assert.equal(list.status, 200, "listing projects must not 500");

    // A status change is the exact call that used to 500 on these databases.
    const created = await fetch(`${baseUrl}/api/v1/projects`, {
      method: "POST",
      headers: authed(token, { Origin: baseUrl }),
      body: JSON.stringify({ title: "Migration probe" }),
    });
    assert.equal(created.status, 201);
    const project = await created.json();

    const moved = await fetch(`${baseUrl}/api/v1/projects/${project.id}`, {
      method: "PUT",
      headers: authed(token, { Origin: baseUrl }),
      body: JSON.stringify({ status: "in-progress" }),
    });
    assert.equal(
      moved.status,
      200,
      "changing project status must not 500 on a migrated database",
    );
  } finally {
    await stopServer(child);
    cleanup();
  }
});

test("delete is recoverable: the row survives, restore keeps task ids, purge destroys", async () => {
  const port = 3095;
  const baseUrl = `http://localhost:${port}`;
  const { dbUrl, cleanup } = tempDbPaths("soft-delete-behaviour");
  const env = buildEnv({ port, dbUrl, baseUrl });
  let child;
  try {
    child = startServer(env);
    await waitForHealth(baseUrl);
    const token = await login(baseUrl);

    const created = await fetch(`${baseUrl}/api/v1/projects`, {
      method: "POST",
      headers: authed(token, { Origin: baseUrl }),
      body: JSON.stringify({ title: "Deletable" }),
    });
    assert.equal(created.status, 201);
    const project = await created.json();

    const taskRes = await fetch(
      `${baseUrl}/api/v1/projects/${project.id}/tasks`,
      {
        method: "POST",
        headers: authed(token, { Origin: baseUrl }),
        body: JSON.stringify({ title: "Survives the round trip" }),
      },
    );
    assert.equal(taskRes.status, 201);
    const originalTaskId = (await taskRes.json()).id;

    // Delete: gone from the API, still present in the table.
    const del = await fetch(`${baseUrl}/api/v1/projects/${project.id}`, {
      method: "DELETE",
      headers: authed(token, { Origin: baseUrl }),
    });
    assert.equal(del.status, 200);

    const gone = await fetch(`${baseUrl}/api/v1/projects/${project.id}`, {
      headers: authed(token),
    });
    assert.equal(gone.status, 404, "a trashed project must not be readable");

    const listed = await (
      await fetch(`${baseUrl}/api/v1/projects`, { headers: authed(token) })
    ).json();
    assert.ok(
      !listed.some((p) => p.id === project.id),
      "a trashed project must not appear in the project list",
    );

    const row = await rawProjectRow(dbUrl, project.id);
    assert.ok(row, "the row must survive a delete — this is the whole point");
    assert.ok(row.deleted_at, "deleted_at must be stamped");

    // It shows up in the trash listing.
    const trash = await (
      await fetch(`${baseUrl}/api/v1/projects/deleted`, {
        headers: authed(token),
      })
    ).json();
    assert.ok(
      trash.projects.some((p) => p.id === project.id),
      "a trashed project must appear in the trash listing",
    );
    assert.equal(trash.retentionDays, 30);

    // Restore returns it with the ORIGINAL task id. The previous client-side
    // snapshot replay re-created tasks and could not preserve ids.
    const restored = await fetch(
      `${baseUrl}/api/v1/projects/${project.id}/restore`,
      { method: "POST", headers: authed(token, { Origin: baseUrl }) },
    );
    assert.equal(restored.status, 200);
    const restoredProject = await restored.json();
    assert.equal(restoredProject.id, project.id);
    assert.equal(
      restoredProject.tasks[0].id,
      originalTaskId,
      "restore must preserve task ids",
    );

    // Purge refuses while the project is live — destroying data takes two steps.
    const prematurePurge = await fetch(
      `${baseUrl}/api/v1/projects/${project.id}/purge`,
      { method: "DELETE", headers: authed(token, { Origin: baseUrl }) },
    );
    assert.equal(
      prematurePurge.status,
      404,
      "purge must only apply to a project already in the trash",
    );

    // Trash it again, then purge for real.
    await fetch(`${baseUrl}/api/v1/projects/${project.id}`, {
      method: "DELETE",
      headers: authed(token, { Origin: baseUrl }),
    });
    const purge = await fetch(
      `${baseUrl}/api/v1/projects/${project.id}/purge`,
      { method: "DELETE", headers: authed(token, { Origin: baseUrl }) },
    );
    assert.equal(purge.status, 200);
    assert.equal(
      await rawProjectRow(dbUrl, project.id),
      null,
      "purge must actually remove the row",
    );
  } finally {
    await stopServer(child);
    cleanup();
  }
});
