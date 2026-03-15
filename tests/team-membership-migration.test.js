const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createClient } = require('@libsql/client');

const DB_MODULE_PATH = path.join(__dirname, '..', 'database.js');

async function seedCorruptTeamData(dbUrl) {
  const client = createClient({ url: dbUrl });
  await client.execute({ sql: 'PRAGMA foreign_keys = ON', args: [] });
  await client.batch([
    {
      sql: `CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        approved INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      args: []
    },
    {
      sql: `CREATE TABLE teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      )`,
      args: []
    },
    {
      sql: `CREATE TABLE team_members (
        team_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (team_id, user_id),
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
      args: []
    },
    { sql: `INSERT INTO users (id, username, email, password_hash) VALUES ('u1', 'owner-one', 'owner-one@example.com', 'hash')`, args: [] },
    { sql: `INSERT INTO users (id, username, email, password_hash) VALUES ('u2', 'owner-two', 'owner-two@example.com', 'hash')`, args: [] },
    { sql: `INSERT INTO users (id, username, email, password_hash) VALUES ('u3', 'member-three', 'member-three@example.com', 'hash')`, args: [] },
    { sql: `INSERT INTO teams (id, name, created_by, created_at) VALUES ('t1', 'Primary Team', 'u1', '2024-01-01T00:00:00.000Z')`, args: [] },
    { sql: `INSERT INTO teams (id, name, created_by, created_at) VALUES ('t2', 'Secondary Team', 'u1', '2024-01-02T00:00:00.000Z')`, args: [] },
    { sql: `INSERT INTO teams (id, name, created_by, created_at) VALUES ('t3', 'Empty After Repair', 'u1', '2024-01-03T00:00:00.000Z')`, args: [] },
    { sql: `INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES ('t1', 'u1', 'owner', '2024-01-01T00:00:00.000Z')`, args: [] },
    { sql: `INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES ('t1', 'u3', 'member', '2024-01-01T01:00:00.000Z')`, args: [] },
    { sql: `INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES ('t2', 'u1', 'owner', '2024-01-02T00:00:00.000Z')`, args: [] },
    { sql: `INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES ('t2', 'u2', 'member', '2024-01-02T01:00:00.000Z')`, args: [] },
    { sql: `INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES ('t3', 'u1', 'owner', '2024-01-03T00:00:00.000Z')`, args: [] }
  ], 'write');
  client.close();
}

test('startup repair fixes duplicate team memberships and restores valid ownership', async () => {
  const dbPath = path.join(os.tmpdir(), `project-overviewer-migration-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const dbUrl = `file:${dbPath}`;
  const previousUrl = process.env.TURSO_DATABASE_URL;

  try {
    await seedCorruptTeamData(dbUrl);

    process.env.TURSO_DATABASE_URL = dbUrl;
    delete require.cache[require.resolve(DB_MODULE_PATH)];
    const db = require(DB_MODULE_PATH);
    await db.waitForDb();
    db.closeDatabase();
    delete require.cache[require.resolve(DB_MODULE_PATH)];

    const verifyClient = createClient({ url: dbUrl });
    const duplicateRows = await verifyClient.execute({
      sql: `SELECT user_id, COUNT(*) AS membership_count
            FROM team_members
            GROUP BY user_id
            HAVING COUNT(*) > 1`,
      args: []
    });
    assert.equal(duplicateRows.rows.length, 0);

    const teamsResult = await verifyClient.execute({
      sql: 'SELECT id, created_by FROM teams ORDER BY id ASC',
      args: []
    });
    const teams = teamsResult.rows.map(row => ({ id: row.id, created_by: row.created_by }));
    assert.deepEqual(teams, [
      { id: 't1', created_by: 'u1' },
      { id: 't2', created_by: 'u2' }
    ]);

    const membershipsResult = await verifyClient.execute({
      sql: 'SELECT team_id, user_id, role FROM team_members ORDER BY team_id ASC, user_id ASC',
      args: []
    });
    const memberships = membershipsResult.rows.map(row => ({
      team_id: row.team_id,
      user_id: row.user_id,
      role: row.role
    }));
    assert.deepEqual(memberships, [
      { team_id: 't1', user_id: 'u1', role: 'owner' },
      { team_id: 't1', user_id: 'u3', role: 'member' },
      { team_id: 't2', user_id: 'u2', role: 'owner' }
    ]);

    await assert.rejects(
      verifyClient.execute({
        sql: `INSERT INTO team_members (team_id, user_id, role, joined_at)
              VALUES ('t1', 'u2', 'member', '2024-01-04T00:00:00.000Z')`,
        args: []
      })
    );

    verifyClient.close();
  } finally {
    if (previousUrl === undefined) {
      delete process.env.TURSO_DATABASE_URL;
    } else {
      process.env.TURSO_DATABASE_URL = previousUrl;
    }
    fs.rmSync(dbPath, { force: true });
  }
});
