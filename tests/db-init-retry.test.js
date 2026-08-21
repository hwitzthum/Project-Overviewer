// Regression guard for the cold-start 500 incident (Vercel, 21 Aug 2026).
//
// A connect timeout to Turso during startup took the whole instance down:
//   {"msg":"Database initialization failed"}  err: connect ETIMEDOUT …:443
//   {"msg":"Unhandled promise rejection"}     same err
//   PromiseRejectionHandledWarning (rejection id: 4)
//   Node.js process exited with exit status: 128
//
// Two coupled defects in database.js produced that:
//   1. dbReadyPromise was rejected explicitly via a captured reject(), and at
//      that instant nothing had attached a handler yet — the request that
//      triggered the thaw was still in Express middleware and had not reached
//      waitForDb(). Node therefore flagged an unhandledRejection, which
//      server.js turns into process.exitCode = 1, killing the instance for
//      every other request it was serving. The PromiseRejectionHandledWarning
//      in the log is the tell: the handler arrived, just too late.
//   2. The promise was created once, so the rejection was cached for the life
//      of the process. Every later request on that warm instance replayed it,
//      long after the database was reachable again — no self-healing.
//
// Both are checked below against a real module load in a child process.
// VERCEL=1 with no TURSO_DATABASE_URL makes initDatabase() throw immediately
// and deterministically, standing in for the network timeout; clearing VERCEL
// afterwards stands in for the database becoming reachable again.
//
// Run with: node --test tests/db-init-retry.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");

const DB_PATH = path.join(__dirname, "..", "database.js");
const SERVER_PATH = path.join(__dirname, "..", "server.js");

// Runs in a child so the module gets a fresh load with a controlled env, and so
// an unhandledRejection cannot affect this test process. Mirrors server.js's
// process-level handler verbatim, since server.js itself is not loaded here.
const CHILD = `
  let unhandled = false;
  process.on("unhandledRejection", () => { unhandled = true; process.exitCode = 1; });

  process.env.VERCEL = "1";
  const db = require(${JSON.stringify(DB_PATH)});
  const tick = () => new Promise((r) => setTimeout(r, 50));

  (async () => {
    // Let the doomed init settle before anything awaits it — the production
    // ordering, and the only way defect 1 is observable.
    await tick();
    await tick();
    const unhandledBeforeAnyWait = unhandled;
    const exitCodeBeforeAnyWait = process.exitCode ?? 0;

    let firstRejected = false;
    try { await db.waitForDb(); } catch { firstRejected = true; }

    // The database becomes reachable again.
    delete process.env.VERCEL;

    let secondResolved = false;
    try { await db.waitForDb(); secondResolved = true; } catch {}

    await tick();
    console.log("RESULT" + JSON.stringify({
      unhandledBeforeAnyWait, exitCodeBeforeAnyWait, firstRejected, secondResolved,
    }));
    process.exit(0);
  })();
`;

function runChild() {
  // cwd is a scratch dir so the "file:projects.db" fallback and dotenv's .env
  // lookup both land there, never on the repo's real database.
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "db-init-retry-"));
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      ["-e", CHILD],
      {
        cwd,
        env: {
          ...process.env,
          NODE_ENV: "test",
          LOG_LEVEL: "silent",
          TURSO_DATABASE_URL: "",
          TURSO_AUTH_TOKEN: "",
        },
        timeout: 60000,
      },
      (err, stdout) => {
        fs.rmSync(cwd, { recursive: true, force: true });
        const line = String(stdout)
          .split("\n")
          .find((l) => l.startsWith("RESULT"));
        if (!line) {
          reject(
            new Error(
              `child produced no result. stdout:\n${stdout}\n${err || ""}`,
            ),
          );
          return;
        }
        resolve(JSON.parse(line.slice("RESULT".length)));
      },
    );
  });
}

test("a failed database init does not surface as an unhandled rejection", async () => {
  const r = await runChild();
  assert.equal(
    r.unhandledBeforeAnyWait,
    false,
    "init failed before any caller awaited it and Node flagged an unhandled " +
      "rejection — server.js turns that into a non-zero exit and the instance dies",
  );
  assert.equal(
    r.exitCodeBeforeAnyWait,
    0,
    "process was marked for a non-zero exit",
  );
});

test("a failed database init is retried on the next call", async () => {
  const r = await runChild();
  assert.equal(
    r.firstRejected,
    true,
    "the failure must still reach the caller",
  );
  assert.equal(
    r.secondResolved,
    true,
    "the second call replayed the cached rejection instead of retrying — a " +
      "warm instance would keep failing after the database recovered",
  );
});

// The two tests above load database.js alone, which is exactly why they missed
// the other half of this incident: server.js builds a SECOND promise over
// db.waitForDb() at module load —
//
//   const initPromise = (async () => { await db.waitForDb(); await seedAdminUser(); })()
//
// — and an API request awaits that one, not dbReadyPromise. It had both of the
// same defects: nothing had attached a handler when it rejected (so the
// unhandledRejection still fired and still killed the instance), and it was
// built once, so no request could ever retry. Production recovered only by
// dying and cold-starting a replacement. These tests drive the real Express
// app so both layers are covered.
const SERVER_CHILD = `
  const http = require("node:http");

  let unhandled = false;
  process.on("unhandledRejection", () => { unhandled = true; process.exitCode = 1; });

  process.env.VERCEL = "1";
  const app = require(${JSON.stringify(SERVER_PATH)});
  const tick = () => new Promise((r) => setTimeout(r, 50));

  const get = (port) => new Promise((resolve) => {
    http.get({ host: "127.0.0.1", port, path: "/api/health" }, (res) => {
      res.resume();
      resolve(res.statusCode);
    }).on("error", () => resolve(0));
  });

  (async () => {
    // Let the doomed init settle before any request awaits it.
    await tick();
    await tick();
    const unhandledBeforeAnyRequest = unhandled;
    const exitCodeBeforeAnyRequest = process.exitCode ?? 0;

    // The database becomes reachable again.
    delete process.env.VERCEL;

    const server = app.listen(0);
    await new Promise((r) => server.once("listening", r));
    const port = server.address().port;

    const firstStatus = await get(port);
    const secondStatus = await get(port);
    server.close();

    await tick();
    console.log("RESULT" + JSON.stringify({
      unhandledBeforeAnyRequest, exitCodeBeforeAnyRequest, firstStatus, secondStatus,
    }));
    process.exit(0);
  })();
`;

function runServerChild() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "server-init-retry-"));
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      ["-e", SERVER_CHILD],
      {
        cwd,
        env: {
          ...process.env,
          NODE_ENV: "test",
          LOG_LEVEL: "silent",
          DISABLE_RATE_LIMIT: "1",
          SECURITY_LOG_PATH: "",
          TURSO_DATABASE_URL: "",
          TURSO_AUTH_TOKEN: "",
          ADMIN_USER: "",
          ADMIN_PASS: "",
        },
        timeout: 60000,
      },
      (err, stdout) => {
        fs.rmSync(cwd, { recursive: true, force: true });
        const line = String(stdout)
          .split("\n")
          .find((l) => l.startsWith("RESULT"));
        if (!line) {
          reject(new Error(`child produced no result. stdout:\n${stdout}\n${err || ""}`));
          return;
        }
        resolve(JSON.parse(line.slice("RESULT".length)));
      },
    );
  });
}

test("a failed cold-start init does not kill the server process", async () => {
  const r = await runServerChild();
  assert.equal(
    r.unhandledBeforeAnyRequest,
    false,
    "server.js's initPromise rejected with no handler attached — the process " +
      "is marked for a non-zero exit and Vercel tears the instance down",
  );
  assert.equal(r.exitCodeBeforeAnyRequest, 0, "process was marked for a non-zero exit");
});

test("a request after a failed cold-start init retries instead of 503-ing forever", async () => {
  const r = await runServerChild();
  assert.equal(
    r.firstStatus,
    200,
    `first request returned ${r.firstStatus} — the middleware awaited a ` +
      "permanently rejected initPromise instead of starting a new attempt",
  );
  assert.equal(r.secondStatus, 200, "second request did not succeed either");
});
