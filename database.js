const { createClient } = require('@libsql/client');
const crypto = require('crypto');
const logger = require('./logger');
const { MAX_DOCUMENTS_PER_USER, VALID_SETTINGS_KEYS } = require('./app-constants');
const {
  SESSION_ABSOLUTE_TIMEOUT_MS,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_TOUCH_INTERVAL_MS,
  SESSION_TOKEN_BYTES
} = require('./session-config');

const ALLOWED_DOC_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf',
  'text/plain'
];

// ========== DATABASE CONNECTION ==========

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:projects.db',
  authToken: process.env.TURSO_AUTH_TOKEN || undefined
});

// Promise-based initialization guard — ensures schema is ready before any
// caller proceeds. The client itself is created synchronously above.
let dbReadyResolve;
let dbReadyReject;
const dbReadyPromise = new Promise((resolve, reject) => {
  dbReadyResolve = resolve;
  dbReadyReject = reject;
});

// Kick off initialization immediately
initDatabase()
  .then(() => {
    logger.info('Database ready for queries');
    dbReadyResolve();
  })
  .catch((err) => {
    logger.error({ err }, 'Database initialization failed');
    dbReadyReject(err);
  });

async function waitForDb() {
  await dbReadyPromise;
}

// ========== QUERY HELPERS ==========

async function run(sql, params = []) {
  const result = await client.execute({ sql, args: params });
  return { changes: Number(result.rowsAffected) };
}

async function get(sql, params = []) {
  const result = await client.execute({ sql, args: params });
  return result.rows[0] || undefined;
}

async function all(sql, params = []) {
  const result = await client.execute({ sql, args: params });
  return result.rows;
}

function generateId() {
  return crypto.randomUUID();
}

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function safeJsonParse(str, fallback = null) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function createDocumentLimitError() {
  const error = new Error(`Document storage limit exceeded (${MAX_DOCUMENTS_PER_USER} documents max)`);
  error.code = 'DOCUMENT_LIMIT_EXCEEDED';
  return error;
}

function createTeamMembershipConflict() {
  const error = new Error('User already belongs to a team');
  error.code = 'TEAM_MEMBERSHIP_CONFLICT';
  return error;
}

function isSingleTeamConstraintError(error) {
  const message = String(error?.message || '');
  return error?.code === 'TEAM_MEMBERSHIP_CONFLICT'
    || (message.includes('team_members.user_id') && /constraint|unique/i.test(message));
}

function parseTimestampValue(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function compareMembershipPriority(userId, left, right) {
  const leftScore = left.created_by === userId && left.role === 'owner'
    ? 0
    : left.role === 'owner' ? 1 : 2;
  const rightScore = right.created_by === userId && right.role === 'owner'
    ? 0
    : right.role === 'owner' ? 1 : 2;

  if (leftScore !== rightScore) return leftScore - rightScore;

  const joinedDiff = parseTimestampValue(left.joined_at) - parseTimestampValue(right.joined_at);
  if (joinedDiff !== 0) return joinedDiff;

  const createdDiff = parseTimestampValue(left.created_at) - parseTimestampValue(right.created_at);
  if (createdDiff !== 0) return createdDiff;

  return String(left.team_id).localeCompare(String(right.team_id));
}

function compareOwnerPriority(team, left, right) {
  const leftScore = left.user_id === team.created_by ? 0 : left.role === 'owner' ? 1 : 2;
  const rightScore = right.user_id === team.created_by ? 0 : right.role === 'owner' ? 1 : 2;

  if (leftScore !== rightScore) return leftScore - rightScore;

  const joinedDiff = parseTimestampValue(left.joined_at) - parseTimestampValue(right.joined_at);
  if (joinedDiff !== 0) return joinedDiff;

  return String(left.user_id).localeCompare(String(right.user_id));
}

async function ensureSessionSchema() {
  const columns = await all('PRAGMA table_info(sessions)');
  const columnNames = new Set(columns.map(column => column.name));

  if (!columnNames.has('last_seen_at')) {
    await run('ALTER TABLE sessions ADD COLUMN last_seen_at TEXT');
  }

  await run(`
    UPDATE sessions
    SET last_seen_at = COALESCE(last_seen_at, created_at, CURRENT_TIMESTAMP)
    WHERE last_seen_at IS NULL
  `);

  await run('CREATE INDEX IF NOT EXISTS idx_sessions_last_seen_at ON sessions(last_seen_at)');
}

async function ensureTaskSubtaskColumn() {
  const columns = await all('PRAGMA table_info(tasks)');
  const columnNames = new Set(columns.map(c => c.name));
  if (!columnNames.has('parent_task_id')) {
    await run('ALTER TABLE tasks ADD COLUMN parent_task_id TEXT');
    await run('CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id)');
    logger.info('Added parent_task_id column to tasks table');
  }
}

async function cleanupExpiredSessions() {
  const nowIso = new Date().toISOString();
  const idleCutoffIso = new Date(Date.now() - SESSION_IDLE_TIMEOUT_MS).toISOString();

  await run(`
    DELETE FROM sessions
    WHERE expires_at <= ?
       OR COALESCE(last_seen_at, created_at, CURRENT_TIMESTAMP) <= ?
  `, [nowIso, idleCutoffIso]);
}

async function repairDuplicateTeamMemberships() {
  const memberships = await all(`
    SELECT tm.user_id, tm.team_id, tm.role, tm.joined_at, t.created_by, t.created_at
    FROM team_members tm
    JOIN teams t ON t.id = tm.team_id
    ORDER BY tm.user_id ASC, t.created_at ASC, tm.joined_at ASC, tm.team_id ASC
  `);

  const membershipsByUser = new Map();
  for (const membership of memberships) {
    if (!membershipsByUser.has(membership.user_id)) {
      membershipsByUser.set(membership.user_id, []);
    }
    membershipsByUser.get(membership.user_id).push(membership);
  }

  const duplicateUsers = [...membershipsByUser.entries()]
    .filter(([, userMemberships]) => userMemberships.length > 1);

  if (duplicateUsers.length === 0) {
    return { usersRepaired: 0, membershipsRemoved: 0 };
  }

  const tx = await client.transaction('write');
  let membershipsRemoved = 0;

  try {
    for (const [userId, userMemberships] of duplicateUsers) {
      const sortedMemberships = [...userMemberships]
        .sort((left, right) => compareMembershipPriority(userId, left, right));

      for (const membership of sortedMemberships.slice(1)) {
        await tx.execute({
          sql: 'DELETE FROM team_members WHERE team_id = ? AND user_id = ?',
          args: [membership.team_id, userId]
        });
        membershipsRemoved += 1;
      }
    }

    await tx.commit();
  } catch (error) {
    await tx.rollback().catch(() => {});
    throw error;
  }

  logger.warn({
    usersRepaired: duplicateUsers.length,
    membershipsRemoved
  }, 'Repaired duplicate team memberships during startup');

  return {
    usersRepaired: duplicateUsers.length,
    membershipsRemoved
  };
}

async function normalizeTeamOwnership() {
  const teams = await all('SELECT id, created_by, created_at FROM teams ORDER BY created_at ASC, id ASC');
  if (teams.length === 0) {
    return { teamsDeleted: 0, teamsReowned: 0 };
  }

  const members = await all(`
    SELECT team_id, user_id, role, joined_at
    FROM team_members
    ORDER BY team_id ASC, joined_at ASC, user_id ASC
  `);
  const membersByTeam = new Map();
  for (const member of members) {
    if (!membersByTeam.has(member.team_id)) {
      membersByTeam.set(member.team_id, []);
    }
    membersByTeam.get(member.team_id).push(member);
  }

  const tx = await client.transaction('write');
  let teamsDeleted = 0;
  let teamsReowned = 0;

  try {
    for (const team of teams) {
      const teamMembers = membersByTeam.get(team.id) || [];

      if (teamMembers.length === 0) {
        await tx.execute({
          sql: 'DELETE FROM teams WHERE id = ?',
          args: [team.id]
        });
        teamsDeleted += 1;
        continue;
      }

      const nextOwner = [...teamMembers].sort((left, right) => compareOwnerPriority(team, left, right))[0];
      const ownerChanged = team.created_by !== nextOwner.user_id
        || teamMembers.some(member => member.user_id === nextOwner.user_id ? member.role !== 'owner' : member.role !== 'member');

      await tx.execute({
        sql: 'UPDATE teams SET created_by = ? WHERE id = ?',
        args: [nextOwner.user_id, team.id]
      });
      await tx.execute({
        sql: `UPDATE team_members
              SET role = CASE WHEN user_id = ? THEN 'owner' ELSE 'member' END
              WHERE team_id = ?`,
        args: [nextOwner.user_id, team.id]
      });

      if (ownerChanged) {
        teamsReowned += 1;
      }
    }

    await tx.commit();
  } catch (error) {
    await tx.rollback().catch(() => {});
    throw error;
  }

  if (teamsDeleted > 0 || teamsReowned > 0) {
    logger.warn({
      teamsDeleted,
      teamsReowned
    }, 'Normalized team ownership during startup');
  }

  return { teamsDeleted, teamsReowned };
}

async function repairTeamMembershipIntegrity() {
  const duplicateSummary = await repairDuplicateTeamMemberships();
  const ownershipSummary = await normalizeTeamOwnership();
  return { ...duplicateSummary, ...ownershipSummary };
}

async function ensureSingleTeamMembershipIndex() {
  const duplicates = await all(`
    SELECT user_id, COUNT(*) AS membership_count
    FROM team_members
    GROUP BY user_id
    HAVING COUNT(*) > 1
  `);

  if (duplicates.length > 0) {
    logger.error({ duplicates }, 'Duplicate team memberships remain after startup repair');
    throw new Error('Unable to enforce single-team membership integrity');
  }

  await run('CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_user_id_unique ON team_members(user_id)');
}

// ========== SCHEMA INITIALIZATION ==========

async function initDatabase() {
  logger.info('Connected to LibSQL/Turso database');

  // foreign_keys must be set outside a batch (PRAGMA not allowed in batches)
  await client.execute({ sql: 'PRAGMA foreign_keys = ON', args: [] });

  // All CREATE TABLE and CREATE INDEX statements in a single atomic batch
  await client.batch([
    // Users table
    {
      sql: `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        approved INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      args: []
    },
    // Sessions table
    {
      sql: `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires_at TEXT NOT NULL,
        last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
      args: []
    },
    // Projects table (user-scoped)
    {
      sql: `CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        stakeholder TEXT DEFAULT '',
        description TEXT DEFAULT '',
        status TEXT DEFAULT 'not-started',
        priority TEXT DEFAULT 'medium',
        due_date TEXT,
        tags TEXT DEFAULT '[]',
        project_order INTEGER DEFAULT 0,
        archived INTEGER DEFAULT 0,
        archived_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
      args: []
    },
    // Tasks table
    {
      sql: `CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        completed INTEGER DEFAULT 0,
        due_date TEXT,
        notes TEXT DEFAULT '',
        priority TEXT DEFAULT 'none',
        recurring TEXT,
        blocked_by TEXT,
        task_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )`,
      args: []
    },
    // Documents table
    {
      sql: `CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        doc_type TEXT NOT NULL,
        title TEXT DEFAULT '',
        payload TEXT,
        file_name TEXT,
        mime_type TEXT,
        content_base64 TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )`,
      args: []
    },
    // Global settings (admin-controlled)
    {
      sql: `CREATE TABLE IF NOT EXISTS global_settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )`,
      args: []
    },
    // User settings (per-user)
    {
      sql: `CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT,
        PRIMARY KEY (user_id, key),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
      args: []
    },
    // Quick notes (user-scoped)
    {
      sql: `CREATE TABLE IF NOT EXISTS quick_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        content TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
      args: []
    },
    // Templates table (shared)
    {
      sql: `CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        tasks TEXT NOT NULL
      )`,
      args: []
    },
    // Teams table
    {
      sql: `CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      )`,
      args: []
    },
    // Team members table
    {
      sql: `CREATE TABLE IF NOT EXISTS team_members (
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
    // Webhooks table
    {
      sql: `CREATE TABLE IF NOT EXISTS webhooks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        url TEXT NOT NULL,
        secret TEXT NOT NULL,
        events TEXT NOT NULL DEFAULT '["*"]',
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
      args: []
    },
    // Indexes
    { sql: 'CREATE INDEX IF NOT EXISTS idx_webhooks_user_id ON webhooks(user_id)', args: [] },
    { sql: 'CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)', args: [] },
    { sql: 'CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)', args: [] },
    { sql: 'CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)', args: [] },
    { sql: 'CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id)', args: [] },
    { sql: 'CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status)', args: [] },
    { sql: 'CREATE INDEX IF NOT EXISTS idx_projects_archived ON projects(archived)', args: [] },
    { sql: 'CREATE INDEX IF NOT EXISTS idx_projects_due_date ON projects(due_date)', args: [] },
    { sql: 'CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id)', args: [] },
    { sql: 'CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed)', args: [] },
    { sql: 'CREATE INDEX IF NOT EXISTS idx_documents_project_id ON documents(project_id)', args: [] },
    { sql: 'CREATE INDEX IF NOT EXISTS idx_quick_notes_user_id ON quick_notes(user_id)', args: [] },
    { sql: 'CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id)', args: [] },
    { sql: 'CREATE INDEX IF NOT EXISTS idx_user_settings_user_key ON user_settings(user_id, key)', args: [] },
    { sql: 'CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id)', args: [] },
    { sql: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_quick_notes_user_id_unique ON quick_notes(user_id)', args: [] }
  ], 'write');

  await ensureSessionSchema();
  await ensureTaskSubtaskColumn();
  await repairTeamMembershipIntegrity();
  await ensureSingleTeamMembershipIndex();

  // ========== SEED DEFAULTS ==========

  // Default templates
  const templateCount = await get('SELECT COUNT(*) as count FROM templates');
  if (templateCount.count === 0) {
    const defaults = [
      { name: 'Bug Report', tasks: ['Reproduce issue', 'Identify root cause', 'Write fix', 'Add tests', 'Deploy'] },
      { name: 'Feature Request', tasks: ['Define requirements', 'Design solution', 'Implement', 'Test', 'Document'] },
      { name: 'Meeting Notes', tasks: ['Review agenda', 'Take notes', 'Action items', 'Follow up'] }
    ];
    for (const t of defaults) {
      await run('INSERT INTO templates (id, name, tasks) VALUES (?, ?, ?)',
        [generateId(), t.name, JSON.stringify(t.tasks)]);
    }
  }

  // Clean expired and idle sessions on startup.
  await cleanupExpiredSessions();

  logger.info('Database initialized successfully');
}

// ========== USER QUERIES ==========

async function createUser(username, email, passwordHash, role = 'user', approved = false) {
  await waitForDb();
  const id = generateId();
  await run(`
    INSERT INTO users (id, username, email, password_hash, role, approved)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [id, username, email, passwordHash, role, approved ? 1 : 0]);

  // Initialize quick notes for new user
  await run('INSERT INTO quick_notes (user_id, content) VALUES (?, ?)', [id, '']);

  return { id, username, email, role, approved };
}

async function getUserByUsername(username) {
  await waitForDb();
  return await get('SELECT * FROM users WHERE username = ?', [username]);
}

async function getUserByEmail(email) {
  await waitForDb();
  return await get('SELECT * FROM users WHERE email = ?', [email]);
}

async function getUserById(id) {
  await waitForDb();
  return await get('SELECT * FROM users WHERE id = ?', [id]);
}

async function getAllUsers() {
  await waitForDb();
  return await all('SELECT id, username, email, role, approved, created_at, updated_at FROM users ORDER BY created_at DESC');
}

async function updateUser(id, updates) {
  await waitForDb();
  const fields = [];
  const values = [];

  if (updates.approved !== undefined) {
    fields.push('approved = ?');
    values.push(updates.approved ? 1 : 0);
  }
  if (updates.role !== undefined) {
    fields.push('role = ?');
    values.push(updates.role);
  }
  if (updates.passwordHash !== undefined) {
    fields.push('password_hash = ?');
    values.push(updates.passwordHash);
  }
  if (updates.email !== undefined) {
    fields.push('email = ?');
    values.push(updates.email);
  }

  if (fields.length === 0) return;

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  await run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
}

async function deleteUser(id) {
  await waitForDb();
  const result = await run('DELETE FROM users WHERE id = ?', [id]);
  return result.changes > 0;
}

// ========== SESSION QUERIES ==========

async function createSession(userId) {
  await waitForDb();
  const id = generateId();
  const token = crypto.randomBytes(SESSION_TOKEN_BYTES).toString('hex');
  const tokenHash = hashSessionToken(token);
  const lastSeenAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_ABSOLUTE_TIMEOUT_MS).toISOString();

  await run(`
    INSERT INTO sessions (id, user_id, token, expires_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
  `, [id, userId, tokenHash, expiresAt, lastSeenAt]);

  return { token, expiresAt, lastSeenAt };
}

async function getSessionByToken(token) {
  await waitForDb();
  const tokenHash = hashSessionToken(token);
  const session = await get(`
    SELECT s.*, u.id as uid, u.username, u.email, u.role, u.approved
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ?
  `, [tokenHash]);

  if (!session) {
    return { status: 'not_found', session: null };
  }

  const now = Date.now();
  const expiresAtMs = Date.parse(session.expires_at);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) {
    await run('DELETE FROM sessions WHERE id = ?', [session.id]);
    return { status: 'absolute_timeout', session: null };
  }

  const lastSeenAt = session.last_seen_at || session.created_at || session.expires_at;
  const lastSeenAtMs = Date.parse(lastSeenAt);
  if (!Number.isFinite(lastSeenAtMs) || lastSeenAtMs <= now - SESSION_IDLE_TIMEOUT_MS) {
    await run('DELETE FROM sessions WHERE id = ?', [session.id]);
    return { status: 'idle_timeout', session: null };
  }

  let effectiveLastSeenAt = lastSeenAt;
  if (now - lastSeenAtMs >= SESSION_TOUCH_INTERVAL_MS) {
    effectiveLastSeenAt = new Date(now).toISOString();
    await run('UPDATE sessions SET last_seen_at = ? WHERE id = ?', [effectiveLastSeenAt, session.id]);
  }

  return {
    status: 'ok',
    session: {
      sessionId: session.id,
      userId: session.uid,
      username: session.username,
      email: session.email,
      role: session.role,
      approved: session.approved === 1,
      expiresAt: session.expires_at,
      lastSeenAt: effectiveLastSeenAt
    }
  };
}

async function deleteSession(token) {
  await waitForDb();
  await run('DELETE FROM sessions WHERE token = ?', [hashSessionToken(token)]);
}

async function deleteUserSessions(userId) {
  await waitForDb();
  await run('DELETE FROM sessions WHERE user_id = ?', [userId]);
}

// ========== PROJECT QUERIES (user-scoped) ==========

function mapProject(project) {
  return {
    ...project,
    ownerName: project.owner_name || project.ownerName || '',
    stakeholder: project.stakeholder || '',
    archived: project.archived === 1,
    archivedAt: project.archived_at || null,
    tags: safeJsonParse(project.tags, []),
    dueDate: project.due_date
  };
}

function mapTask(task) {
  return {
    id: task.id,
    title: task.title,
    completed: task.completed === 1,
    dueDate: task.due_date,
    notes: task.notes,
    priority: task.priority,
    recurring: task.recurring,
    blockedBy: task.blocked_by || null,
    parentTaskId: task.parent_task_id || null,
    subtasks: []
  };
}

/**
 * Nest flat mapped tasks into a parent→children structure.
 * Top-level tasks (parentTaskId === null) get subtasks attached.
 * Orphan subtasks (parent missing) are promoted to top-level.
 */
function nestTasks(flatMappedTasks) {
  const topLevel = [];
  const parentMap = new Map();

  // First pass: collect top-level tasks
  for (const t of flatMappedTasks) {
    if (!t.parentTaskId) {
      topLevel.push(t);
      parentMap.set(t.id, t);
    }
  }

  // Second pass: attach subtasks to parents
  for (const t of flatMappedTasks) {
    if (t.parentTaskId) {
      const parent = parentMap.get(t.parentTaskId);
      if (parent) {
        parent.subtasks.push(t);
      } else {
        // Orphan — promote to top-level
        t.parentTaskId = null;
        topLevel.push(t);
      }
    }
  }

  return topLevel;
}

function mapDocument(row, includeContent = false) {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.doc_type,
    title: row.title,
    createdAt: row.created_at,
    fileName: row.file_name,
    mimeType: row.mime_type,
    email: safeJsonParse(row.payload, null),
    hasContent: Boolean(row.content_base64),
    contentBase64: includeContent ? row.content_base64 : undefined
  };
}

// Bulk fetch: 3 queries instead of 2N+1
// options.teamUserIds: array of user_ids to fetch for (team mode)
async function getAllProjects(userId, options = {}) {
  const { includeDocumentContent = false, teamUserIds = null } = options;
  await waitForDb();

  let projects;
  if (teamUserIds && teamUserIds.length > 1) {
    const userPlaceholders = teamUserIds.map(() => '?').join(',');
    projects = await all(
      `SELECT p.*, u.username AS owner_name
       FROM projects p
       JOIN users u ON p.user_id = u.id
       WHERE p.user_id IN (${userPlaceholders})
       ORDER BY p.project_order ASC, p.created_at DESC`,
      teamUserIds
    );
  } else {
    projects = await all(
      `SELECT p.*, u.username AS owner_name
       FROM projects p
       JOIN users u ON p.user_id = u.id
       WHERE p.user_id = ?
       ORDER BY p.project_order ASC, p.created_at DESC`,
      [userId]
    );
  }

  if (projects.length === 0) return [];

  // Bulk fetch all tasks for these projects
  const projectIds = projects.map(p => p.id);
  const placeholders = projectIds.map(() => '?').join(',');

  const allTasks = await all(
    `SELECT * FROM tasks WHERE project_id IN (${placeholders}) ORDER BY task_order ASC, created_at ASC`,
    projectIds
  );

  const docSelect = includeDocumentContent
    ? 'SELECT * FROM documents'
    : 'SELECT id, project_id, doc_type, title, file_name, mime_type, created_at, (content_base64 IS NOT NULL) as has_content FROM documents';
  const allDocs = await all(
    `${docSelect} WHERE project_id IN (${placeholders}) ORDER BY created_at ASC`,
    projectIds
  );

  // Group by project_id, then nest subtasks under parents
  const flatByProject = new Map();
  for (const task of allTasks) {
    if (!flatByProject.has(task.project_id)) flatByProject.set(task.project_id, []);
    flatByProject.get(task.project_id).push(mapTask(task));
  }
  const tasksByProject = new Map();
  for (const [pid, tasks] of flatByProject) {
    tasksByProject.set(pid, nestTasks(tasks));
  }

  const docsByProject = new Map();
  for (const doc of allDocs) {
    if (!docsByProject.has(doc.project_id)) docsByProject.set(doc.project_id, []);
    if (includeDocumentContent) {
      docsByProject.get(doc.project_id).push(mapDocument(doc, true));
    } else {
      docsByProject.get(doc.project_id).push({
        id: doc.id,
        projectId: doc.project_id,
        type: doc.doc_type,
        title: doc.title,
        createdAt: doc.created_at,
        fileName: doc.file_name,
        mimeType: doc.mime_type,
        hasContent: Boolean(doc.has_content)
      });
    }
  }

  return projects.map(project => ({
    ...mapProject(project),
    tasks: tasksByProject.get(project.id) || [],
    documents: docsByProject.get(project.id) || []
  }));
}

async function getProjectById(id, userId, options = {}) {
  const { teamUserIds = null } = options;
  await waitForDb();

  let project;
  if (teamUserIds && teamUserIds.length > 1) {
    const userPlaceholders = teamUserIds.map(() => '?').join(',');
    project = await get(
      `SELECT p.*, u.username AS owner_name
       FROM projects p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = ? AND p.user_id IN (${userPlaceholders})`,
      [id, ...teamUserIds]
    );
  } else {
    project = await get(
      `SELECT p.*, u.username AS owner_name
       FROM projects p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = ? AND p.user_id = ?`,
      [id, userId]
    );
  }
  if (!project) return null;

  const tasks = await all(
    'SELECT * FROM tasks WHERE project_id = ? ORDER BY task_order ASC, created_at ASC',
    [id]
  );
  const docs = await all(
    'SELECT id, project_id, doc_type, title, payload, file_name, mime_type, created_at FROM documents WHERE project_id = ? ORDER BY created_at ASC',
    [id]
  );

  return {
    ...mapProject(project),
    tasks: nestTasks(tasks.map(mapTask)),
    documents: docs.map(d => mapDocument(d, false))
  };
}

async function createProject(userId, project) {
  await waitForDb();
  const id = generateId();
  const owner = await getUserById(userId);
  await run(`
    INSERT INTO projects (id, user_id, title, stakeholder, description, status, priority, due_date, tags, project_order, archived, archived_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    userId,
    project.title,
    project.stakeholder || '',
    project.description || '',
    project.status || 'not-started',
    project.priority || 'medium',
    project.dueDate || null,
    JSON.stringify(project.tags || []),
    project.order || 0,
    project.archived ? 1 : 0,
    project.archivedAt || null
  ]);

  // Return the created project directly (no re-fetch)
  return {
    id,
    user_id: userId,
    ownerName: owner?.username || '',
    title: project.title,
    stakeholder: project.stakeholder || '',
    description: project.description || '',
    status: project.status || 'not-started',
    priority: project.priority || 'medium',
    dueDate: project.dueDate || null,
    tags: project.tags || [],
    order: project.order || 0,
    archived: project.archived || false,
    archivedAt: project.archivedAt || null,
    tasks: [],
    documents: []
  };
}

async function countProjectsByUser(userId) {
  await waitForDb();
  const row = await get('SELECT COUNT(*) AS count FROM projects WHERE user_id = ?', [userId]);
  return Number(row?.count || 0);
}

async function updateProject(id, userId, updates) {
  await waitForDb();
  const fields = [];
  const values = [];

  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.stakeholder !== undefined) {
    fields.push('stakeholder = ?');
    values.push(updates.stakeholder || '');
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.priority !== undefined) {
    fields.push('priority = ?');
    values.push(updates.priority);
  }
  if (updates.dueDate !== undefined) {
    fields.push('due_date = ?');
    values.push(updates.dueDate);
  }
  if (updates.tags !== undefined) {
    fields.push('tags = ?');
    values.push(JSON.stringify(updates.tags));
  }
  if (updates.order !== undefined) {
    fields.push('project_order = ?');
    values.push(updates.order);
  }
  if (updates.archived !== undefined) {
    fields.push('archived = ?');
    values.push(updates.archived ? 1 : 0);
    if (updates.archived) {
      fields.push('archived_at = ?');
      values.push(updates.archivedAt || new Date().toISOString());
    } else {
      fields.push('archived_at = NULL');
    }
  }

  if (fields.length === 0) return await getProjectById(id, userId);

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id, userId);

  const result = await run(
    `UPDATE projects SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
    values
  );

  if (result.changes === 0) return null;

  // Return full project including tasks and documents so callers always get complete data
  return getProjectById(id, userId);
}

async function deleteProject(id, userId) {
  await waitForDb();
  const result = await run('DELETE FROM projects WHERE id = ? AND user_id = ?', [id, userId]);
  return result.changes > 0;
}

async function reorderProjects(userId, projectOrders) {
  await waitForDb();
  if (!projectOrders || projectOrders.length === 0) return;

  const tx = await client.transaction('write');
  try {
    const cases = projectOrders.map(() => 'WHEN ? THEN ?').join(' ');
    const caseParams = projectOrders.flatMap(p => [p.id, p.order]);
    const ids = projectOrders.map(p => p.id);
    const placeholders = ids.map(() => '?').join(',');

    await tx.execute({
      sql: `UPDATE projects SET project_order = CASE id ${cases} END WHERE id IN (${placeholders}) AND user_id = ?`,
      args: [...caseParams, ...ids, userId]
    });
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

// ========== TASK QUERIES ==========

// Verify task belongs to user's project
async function verifyTaskOwnership(taskId, userId) {
  const row = await get(`
    SELECT t.id FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE t.id = ? AND p.user_id = ?
  `, [taskId, userId]);
  return Boolean(row);
}

async function getProjectTasks(projectId, userId) {
  await waitForDb();
  // Verify project ownership
  const project = await get('SELECT id FROM projects WHERE id = ? AND user_id = ?', [projectId, userId]);
  if (!project) return null;

  const tasks = await all(
    'SELECT * FROM tasks WHERE project_id = ? ORDER BY task_order ASC, created_at ASC',
    [projectId]
  );
  return nestTasks(tasks.map(mapTask));
}

async function countTasksByProject(projectId, userId) {
  await waitForDb();
  const row = await get(`
    SELECT p.id AS project_id, COUNT(t.id) AS count
    FROM projects p
    LEFT JOIN tasks t ON t.project_id = p.id AND t.parent_task_id IS NULL
    WHERE p.id = ? AND p.user_id = ?
    GROUP BY p.id
  `, [projectId, userId]);

  if (!row) return null;
  return Number(row.count || 0);
}

async function createTask(projectId, userId, task) {
  await waitForDb();
  // Verify project ownership
  const project = await get('SELECT id FROM projects WHERE id = ? AND user_id = ?', [projectId, userId]);
  if (!project) return null;

  // Validate subtask nesting (1-level max)
  const parentTaskId = task.parentTaskId || null;
  if (parentTaskId) {
    const parent = await get(
      'SELECT id, parent_task_id FROM tasks WHERE id = ? AND project_id = ?',
      [parentTaskId, projectId]
    );
    if (!parent) return null; // parent doesn't exist in this project
    if (parent.parent_task_id) {
      throw new Error('Cannot nest subtasks more than one level');
    }
  }

  const id = generateId();

  let taskOrder = Number.isInteger(task.order) ? task.order : null;
  if (taskOrder === null) {
    const row = await get(
      'SELECT COALESCE(MAX(task_order), -1) AS max_order FROM tasks WHERE project_id = ?',
      [projectId]
    );
    taskOrder = (row?.max_order ?? -1) + 1;
  }

  await run(`
    INSERT INTO tasks (id, project_id, title, completed, due_date, notes, priority, recurring, blocked_by, task_order, parent_task_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, projectId, task.title,
    task.completed ? 1 : 0,
    task.dueDate || null,
    task.notes || '',
    task.priority || 'none',
    task.recurring || null,
    task.blockedBy || null,
    taskOrder,
    parentTaskId
  ]);

  return id;
}

async function updateTask(taskId, userId, updates) {
  await waitForDb();
  if (!(await verifyTaskOwnership(taskId, userId))) return false;

  const fields = [];
  const values = [];

  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.completed !== undefined) {
    fields.push('completed = ?');
    values.push(updates.completed ? 1 : 0);
  }
  if (updates.dueDate !== undefined) {
    fields.push('due_date = ?');
    values.push(updates.dueDate);
  }
  if (updates.notes !== undefined) {
    fields.push('notes = ?');
    values.push(updates.notes);
  }
  if (updates.priority !== undefined) {
    fields.push('priority = ?');
    values.push(updates.priority);
  }
  if (updates.recurring !== undefined) {
    fields.push('recurring = ?');
    values.push(updates.recurring);
  }
  if (updates.blockedBy !== undefined) {
    fields.push('blocked_by = ?');
    values.push(updates.blockedBy || null);
  }
  if (updates.parentTaskId !== undefined) {
    const newParentId = updates.parentTaskId || null;
    if (newParentId) {
      // Look up this task's project so we can scope the parent check
      const thisTask = await get('SELECT project_id FROM tasks WHERE id = ?', [taskId]);
      if (!thisTask) return false;
      // Enforce 1-level nesting: parent must exist in the same project and not itself be a subtask
      const parent = await get(
        'SELECT parent_task_id FROM tasks WHERE id = ? AND project_id = ?',
        [newParentId, thisTask.project_id]
      );
      if (!parent) return false;
      if (parent.parent_task_id) {
        throw new Error('Cannot nest subtasks more than one level');
      }
      // Cannot make a task its own parent
      if (newParentId === taskId) return false;
      // Reject if this task already has children — would create a 2-level chain
      const childCount = await get('SELECT COUNT(*) AS count FROM tasks WHERE parent_task_id = ?', [taskId]);
      if (Number(childCount?.count) > 0) {
        throw new Error('Cannot reparent a task that already has subtasks');
      }
    }
    fields.push('parent_task_id = ?');
    values.push(newParentId);
  }

  if (fields.length === 0) return true;

  values.push(taskId);
  await run(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, values);
  return true;
}

async function deleteTask(taskId, userId) {
  await waitForDb();
  if (!(await verifyTaskOwnership(taskId, userId))) return false;

  // Delete subtasks first (FK cascade not enforced for columns added via ALTER TABLE)
  await run('DELETE FROM tasks WHERE parent_task_id = ?', [taskId]);
  const result = await run('DELETE FROM tasks WHERE id = ?', [taskId]);
  return result.changes > 0;
}

async function reorderTasks(projectId, userId, taskOrders) {
  await waitForDb();
  // Verify project ownership
  const project = await get('SELECT id FROM projects WHERE id = ? AND user_id = ?', [projectId, userId]);
  if (!project) return false;
  if (!taskOrders || taskOrders.length === 0) return true;

  const tx = await client.transaction('write');
  try {
    const cases = taskOrders.map(() => 'WHEN ? THEN ?').join(' ');
    const caseParams = taskOrders.flatMap(t => [t.id, t.order]);
    const ids = taskOrders.map(t => t.id);
    const placeholders = ids.map(() => '?').join(',');

    await tx.execute({
      sql: `UPDATE tasks SET task_order = CASE id ${cases} END WHERE id IN (${placeholders}) AND project_id = ?`,
      args: [...caseParams, ...ids, projectId]
    });
    await tx.commit();
    return true;
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

// ========== DOCUMENT QUERIES ==========

async function getProjectDocuments(projectId, userId, options = {}) {
  const { includeContent = false, teamUserIds = null } = options;
  await waitForDb();

  let project;
  if (teamUserIds && teamUserIds.length > 1) {
    const userPlaceholders = teamUserIds.map(() => '?').join(',');
    project = await get(
      `SELECT id FROM projects WHERE id = ? AND user_id IN (${userPlaceholders})`,
      [projectId, ...teamUserIds]
    );
  } else {
    project = await get('SELECT id FROM projects WHERE id = ? AND user_id = ?', [projectId, userId]);
  }
  if (!project) return null;

  const select = includeContent
    ? 'SELECT * FROM documents'
    : 'SELECT id, project_id, doc_type, title, payload, file_name, mime_type, created_at FROM documents';
  const rows = await all(
    `${select} WHERE project_id = ? ORDER BY created_at ASC`,
    [projectId]
  );
  return rows.map(row => mapDocument(row, includeContent));
}

async function getDocumentById(id, userId, options = {}) {
  const { teamUserIds = null } = options;
  await waitForDb();
  let row;
  if (teamUserIds && teamUserIds.length > 1) {
    const userPlaceholders = teamUserIds.map(() => '?').join(',');
    row = await get(`
      SELECT d.* FROM documents d
      JOIN projects p ON d.project_id = p.id
      WHERE d.id = ? AND p.user_id IN (${userPlaceholders})
    `, [id, ...teamUserIds]);
  } else {
    row = await get(`
      SELECT d.* FROM documents d
      JOIN projects p ON d.project_id = p.id
      WHERE d.id = ? AND p.user_id = ?
    `, [id, userId]);
  }

  if (!row) return null;
  return mapDocument(row, true);
}

async function createDocument(projectId, userId, doc) {
  await waitForDb();
  // Verify project ownership
  const project = await get('SELECT id FROM projects WHERE id = ? AND user_id = ?', [projectId, userId]);
  if (!project) return null;

  const documentCount = await countDocumentsByUser(userId);
  if (documentCount >= MAX_DOCUMENTS_PER_USER) {
    throw createDocumentLimitError();
  }

  const id = generateId();
  const docType = doc.type;
  let title = doc.title || '';
  let payload = null;
  let fileName = null;
  let mimeType = null;
  let contentBase64 = null;

  if (docType === 'email') {
    const email = doc.email || {};
    payload = JSON.stringify({
      subject: email.subject || '',
      from: email.from || '',
      to: email.to || '',
      date: email.date || '',
      body: email.body || ''
    });
    title = title || email.subject || 'Email';
  } else if (docType === 'docx') {
    fileName = doc.fileName || '';
    const requestedMime = doc.mimeType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    mimeType = ALLOWED_DOC_MIME_TYPES.includes(requestedMime)
      ? requestedMime
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    contentBase64 = doc.contentBase64 || '';
    title = title || fileName || 'Document';
  } else {
    throw new Error('Unsupported document type');
  }

  await run(`
    INSERT INTO documents (id, project_id, doc_type, title, payload, file_name, mime_type, content_base64)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, projectId, docType, title, payload, fileName, mimeType, contentBase64]);

  return id;
}

async function countDocumentsByUser(userId) {
  await waitForDb();
  const row = await get(`
    SELECT COUNT(d.id) AS count
    FROM documents d
    JOIN projects p ON d.project_id = p.id
    WHERE p.user_id = ?
  `, [userId]);
  return Number(row?.count || 0);
}

async function deleteDocument(id, userId) {
  await waitForDb();
  // Verify ownership via project
  const doc = await get(`
    SELECT d.id FROM documents d
    JOIN projects p ON d.project_id = p.id
    WHERE d.id = ? AND p.user_id = ?
  `, [id, userId]);
  if (!doc) return false;

  const result = await run('DELETE FROM documents WHERE id = ?', [id]);
  return result.changes > 0;
}

// ========== SETTINGS QUERIES ==========

// Global settings (admin only)
async function getGlobalSetting(key) {
  await waitForDb();
  const row = await get('SELECT value FROM global_settings WHERE key = ?', [key]);
  return row ? safeJsonParse(row.value) : null;
}

async function setGlobalSetting(key, value) {
  await waitForDb();
  await run(
    'INSERT OR REPLACE INTO global_settings (key, value) VALUES (?, ?)',
    [key, JSON.stringify(value)]
  );
}

async function getAllGlobalSettings() {
  await waitForDb();
  const rows = await all('SELECT * FROM global_settings');
  const settings = {};
  for (const row of rows) {
    settings[row.key] = safeJsonParse(row.value);
  }
  return settings;
}

// User settings
async function getUserSetting(userId, key) {
  await waitForDb();
  const row = await get('SELECT value FROM user_settings WHERE user_id = ? AND key = ?', [userId, key]);
  return row ? safeJsonParse(row.value) : null;
}

async function setUserSetting(userId, key, value) {
  await waitForDb();
  await run(
    'INSERT OR REPLACE INTO user_settings (user_id, key, value) VALUES (?, ?, ?)',
    [userId, key, JSON.stringify(value)]
  );
}

async function getAllUserSettings(userId) {
  await waitForDb();
  const rows = await all('SELECT * FROM user_settings WHERE user_id = ?', [userId]);
  const settings = {};
  for (const row of rows) {
    settings[row.key] = safeJsonParse(row.value);
  }
  return settings;
}

// ========== QUICK NOTES QUERIES (user-scoped) ==========

async function getQuickNotes(userId) {
  await waitForDb();
  const note = await get('SELECT content FROM quick_notes WHERE user_id = ? ORDER BY id DESC LIMIT 1', [userId]);
  return note ? note.content : '';
}

async function saveQuickNotes(userId, content) {
  await waitForDb();
  await run(
    `INSERT INTO quick_notes (user_id, content, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP`,
    [userId, content]
  );
}

// ========== TEMPLATES QUERIES ==========

async function getAllTemplates() {
  await waitForDb();
  const templates = await all('SELECT * FROM templates');
  return templates.map(t => ({
    id: t.id,
    name: t.name,
    tasks: safeJsonParse(t.tasks, [])
  }));
}

// ========== TEAM QUERIES ==========

async function createTeam(name, userId) {
  await waitForDb();
  const id = generateId();
  const tx = await client.transaction('write');

  try {
    const existing = await tx.execute({
      sql: 'SELECT team_id FROM team_members WHERE user_id = ? LIMIT 1',
      args: [userId]
    });
    if (existing.rows.length > 0) {
      throw createTeamMembershipConflict();
    }

    await tx.execute({
      sql: 'INSERT INTO teams (id, name, created_by) VALUES (?, ?, ?)',
      args: [id, name, userId]
    });
    await tx.execute({
      sql: 'INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)',
      args: [id, userId, 'owner']
    });
    await tx.commit();
    return { id, name, createdBy: userId };
  } catch (error) {
    await tx.rollback().catch(() => {});
    if (isSingleTeamConstraintError(error)) {
      throw createTeamMembershipConflict();
    }
    throw error;
  }
}

async function getTeamByUserId(userId) {
  await waitForDb();
  const membership = await get(`
    SELECT t.id, t.name, t.created_by, t.created_at, tm.role as my_role
    FROM team_members tm
    JOIN teams t ON tm.team_id = t.id
    WHERE tm.user_id = ?
  `, [userId]);

  if (!membership) return null;

  const members = await all(`
    SELECT tm.user_id, tm.role, tm.joined_at, u.username, u.email
    FROM team_members tm
    JOIN users u ON tm.user_id = u.id
    WHERE tm.team_id = ?
    ORDER BY tm.role DESC, tm.joined_at ASC
  `, [membership.id]);

  return {
    id: membership.id,
    name: membership.name,
    createdBy: membership.created_by,
    createdAt: membership.created_at,
    myRole: membership.my_role,
    members: members.map(m => ({
      userId: m.user_id,
      username: m.username,
      email: m.email,
      role: m.role,
      joinedAt: m.joined_at
    }))
  };
}

async function addTeamMember(teamId, userId) {
  await waitForDb();
  const tx = await client.transaction('write');

  try {
    const existing = await tx.execute({
      sql: 'SELECT team_id FROM team_members WHERE user_id = ? LIMIT 1',
      args: [userId]
    });
    if (existing.rows.length > 0) {
      throw createTeamMembershipConflict();
    }

    await tx.execute({
      sql: 'INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)',
      args: [teamId, userId, 'member']
    });
    await tx.commit();
  } catch (error) {
    await tx.rollback().catch(() => {});
    if (isSingleTeamConstraintError(error)) {
      throw createTeamMembershipConflict();
    }
    throw error;
  }
}

async function removeTeamMember(teamId, userId) {
  await waitForDb();
  const result = await run('DELETE FROM team_members WHERE team_id = ? AND user_id = ?',
    [teamId, userId]);
  return result.changes > 0;
}

async function deleteTeam(teamId) {
  await waitForDb();
  const result = await run('DELETE FROM teams WHERE id = ?', [teamId]);
  return result.changes > 0;
}

async function getTeamUserIds(userId) {
  await waitForDb();
  const members = await all(
    `SELECT tm2.user_id FROM team_members tm1
     JOIN team_members tm2 ON tm1.team_id = tm2.team_id
     WHERE tm1.user_id = ?`,
    [userId]
  );
  return members.length > 0 ? members.map(m => m.user_id) : [userId];
}

// ========== EXPORT/IMPORT (user-scoped) ==========

async function exportData(userId) {
  await waitForDb();
  const projects = await getAllProjects(userId, { includeDocumentContent: true });
  const settings = await getAllUserSettings(userId);
  const quickNotes = await getQuickNotes(userId);
  const templates = await getAllTemplates();

  return {
    version: '2.0',
    projects,
    settings,
    quickNotes,
    templates,
    exportedAt: new Date().toISOString()
  };
}

async function importData(userId, data) {
  await waitForDb();

  const tx = await client.transaction('write');

  // Local helpers that route through the transaction instead of the shared client
  async function txRun(sql, params = []) {
    const result = await tx.execute({ sql, args: params });
    return { changes: Number(result.rowsAffected) };
  }

  async function txGet(sql, params = []) {
    const result = await tx.execute({ sql, args: params });
    return result.rows[0] || undefined;
  }

  try {
    const importedDocumentCount = (data.projects || []).reduce((count, project) => (
      count + (project.documents || []).length
    ), 0);
    if (importedDocumentCount > MAX_DOCUMENTS_PER_USER) {
      throw createDocumentLimitError();
    }

    // Delete only this user's data
    const userProjectsResult = await tx.execute({ sql: 'SELECT id FROM projects WHERE user_id = ?', args: [userId] });
    const projectIds = userProjectsResult.rows.map(p => p.id);

    if (projectIds.length > 0) {
      const placeholders = projectIds.map(() => '?').join(',');
      await txRun(`DELETE FROM tasks WHERE project_id IN (${placeholders})`, projectIds);
      await txRun(`DELETE FROM documents WHERE project_id IN (${placeholders})`, projectIds);
    }
    await txRun('DELETE FROM projects WHERE user_id = ?', [userId]);
    await txRun('DELETE FROM user_settings WHERE user_id = ?', [userId]);

    // Import projects with direct inserts (no re-fetch)
    if (data.projects) {
      for (const project of data.projects) {
        const projectId = generateId();
        await txRun(`
          INSERT INTO projects (id, user_id, title, stakeholder, description, status, priority, due_date, tags, project_order, archived, archived_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          projectId, userId,
          project.title || 'Untitled',
          project.stakeholder || '',
          project.description || '',
          project.status || 'not-started',
          project.priority || 'medium',
          project.dueDate || null,
          JSON.stringify(project.tags || []),
          project.order || project.project_order || 0,
          project.archived ? 1 : 0,
          project.archivedAt || null
        ]);

        if (project.tasks) {
          // Flatten nested subtasks for import (exported format has subtasks arrays)
          const flatTasks = [];
          for (let i = 0; i < project.tasks.length; i++) {
            const task = project.tasks[i];
            flatTasks.push({ ...task, _order: task.order ?? i, _parentRef: task.parentTaskId || null });
            if (task.subtasks && task.subtasks.length > 0) {
              for (let j = 0; j < task.subtasks.length; j++) {
                const sub = task.subtasks[j];
                flatTasks.push({ ...sub, _order: sub.order ?? j, _parentRef: task.id || '__parent_' + i });
              }
            }
          }

          // Pass 1: Insert all tasks without parent references, building ID map
          const taskIdMap = new Map(); // old ID → new ID
          for (const task of flatTasks) {
            const newId = generateId();
            if (task.id) taskIdMap.set(task.id, newId);
            await txRun(`
              INSERT INTO tasks (id, project_id, title, completed, due_date, notes, priority, recurring, blocked_by, task_order)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              newId, projectId,
              task.title || 'Untitled',
              task.completed ? 1 : 0,
              task.dueDate || null,
              task.notes || '',
              task.priority || 'none',
              task.recurring || null,
              task.blockedBy || null,
              task._order
            ]);
          }

          // Pass 2: Set parent_task_id for subtasks using ID map
          for (const task of flatTasks) {
            if (task._parentRef) {
              const newParentId = taskIdMap.get(task._parentRef);
              const newTaskId = task.id ? taskIdMap.get(task.id) : null;
              if (newParentId && newTaskId) {
                await txRun('UPDATE tasks SET parent_task_id = ? WHERE id = ?', [newParentId, newTaskId]);
              }
            }
          }
        }

        if (project.documents) {
          for (const doc of project.documents) {
            const docType = doc.type;
            if (docType !== 'email' && docType !== 'docx') continue;

            let payload = null;
            let fileName = null;
            let mimeType = null;
            let contentBase64 = null;

            if (docType === 'email') {
              const email = doc.email || {};
              payload = JSON.stringify({
                subject: email.subject || '',
                from: email.from || '',
                to: email.to || '',
                date: email.date || '',
                body: email.body || ''
              });
            } else if (docType === 'docx') {
              fileName = doc.fileName || '';
              const requestedMime = doc.mimeType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
              mimeType = ALLOWED_DOC_MIME_TYPES.includes(requestedMime)
                ? requestedMime
                : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
              contentBase64 = doc.contentBase64 || '';
            }

            await txRun(`
              INSERT INTO documents (id, project_id, doc_type, title, payload, file_name, mime_type, content_base64)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [generateId(), projectId, docType, doc.title || '', payload, fileName, mimeType, contentBase64]);
          }
        }
      }
    }

    // Import user settings (allowlist enforced)
    if (data.settings) {
      for (const [key, value] of Object.entries(data.settings)) {
        if (!VALID_SETTINGS_KEYS.includes(key)) continue;
        await txRun(
          'INSERT OR REPLACE INTO user_settings (user_id, key, value) VALUES (?, ?, ?)',
          [userId, key, JSON.stringify(value)]
        );
      }
    }

    // Import quick notes
    if (data.quickNotes !== undefined) {
      const existing = await txGet('SELECT id FROM quick_notes WHERE user_id = ? ORDER BY id DESC LIMIT 1', [userId]);
      if (existing) {
        await txRun('UPDATE quick_notes SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [data.quickNotes, existing.id]);
      } else {
        await txRun('INSERT INTO quick_notes (user_id, content) VALUES (?, ?)', [userId, data.quickNotes]);
      }
    }

    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

// ========== WEBHOOKS ==========

async function createWebhook(userId, data) {
  await waitForDb();
  const { MAX_WEBHOOKS_PER_USER } = require('./app-constants');
  const existing = await get('SELECT COUNT(*) AS count FROM webhooks WHERE user_id = ?', [userId]);
  if (Number(existing?.count) >= MAX_WEBHOOKS_PER_USER) {
    const err = new Error(`Webhook limit reached (max ${MAX_WEBHOOKS_PER_USER})`);
    err.code = 'WEBHOOK_LIMIT_EXCEEDED';
    throw err;
  }
  const id = generateId();
  const secret = require('crypto').randomBytes(32).toString('hex');
  const events = JSON.stringify(data.events);
  await run(
    'INSERT INTO webhooks (id, user_id, url, secret, events) VALUES (?, ?, ?, ?, ?)',
    [id, userId, data.url, secret, events]
  );
  return { id, url: data.url, secret, events: data.events, active: true };
}

async function getWebhooksByUser(userId) {
  await waitForDb();
  const rows = await all('SELECT * FROM webhooks WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  return rows.map(w => ({
    id: w.id,
    url: w.url,
    secret: w.secret,
    events: safeJsonParse(w.events, ['*']),
    active: w.active === 1,
    createdAt: w.created_at
  }));
}

async function getActiveWebhooksForUser(userId) {
  await waitForDb();
  const rows = await all(
    'SELECT * FROM webhooks WHERE user_id = ? AND active = 1',
    [userId]
  );
  return rows.map(w => ({
    id: w.id,
    url: w.url,
    secret: w.secret,
    events: w.events
  }));
}

async function updateWebhook(webhookId, userId, updates) {
  await waitForDb();
  const fields = [];
  const params = [];

  if (updates.url !== undefined) { fields.push('url = ?'); params.push(updates.url); }
  if (updates.events !== undefined) { fields.push('events = ?'); params.push(JSON.stringify(updates.events)); }
  if (updates.active !== undefined) { fields.push('active = ?'); params.push(updates.active ? 1 : 0); }

  if (fields.length === 0) return false;

  params.push(webhookId, userId);
  const result = await run(
    `UPDATE webhooks SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
    params
  );
  return result.changes > 0;
}

async function deleteWebhook(webhookId, userId) {
  await waitForDb();
  const result = await run('DELETE FROM webhooks WHERE id = ? AND user_id = ?', [webhookId, userId]);
  return result.changes > 0;
}

// ========== HEALTH CHECK ==========

async function healthCheck() {
  try {
    await waitForDb();
    await get('SELECT 1');
    return { status: 'ok' };
  } catch (error) {
    logger.error({ err: error }, 'Health check failed');
    return { status: 'error', message: 'Database unavailable' };
  }
}

// ========== GRACEFUL SHUTDOWN ==========

function closeDatabase() {
  try {
    client.close();
    logger.info('Database connection closed');
  } catch (err) {
    logger.error({ err }, 'Error closing database');
  }
}

module.exports = {
  // Users
  createUser,
  getUserByUsername,
  getUserByEmail,
  getUserById,
  getAllUsers,
  updateUser,
  deleteUser,
  // Sessions
  createSession,
  getSessionByToken,
  deleteSession,
  deleteUserSessions,
  // Projects
  getAllProjects,
  getProjectById,
  createProject,
  countProjectsByUser,
  updateProject,
  deleteProject,
  reorderProjects,
  // Tasks
  getProjectTasks,
  countTasksByProject,
  createTask,
  updateTask,
  deleteTask,
  reorderTasks,
  // Documents
  getProjectDocuments,
  getDocumentById,
  createDocument,
  countDocumentsByUser,
  deleteDocument,
  // Global Settings
  getGlobalSetting,
  setGlobalSetting,
  getAllGlobalSettings,
  // User Settings
  getUserSetting,
  setUserSetting,
  getAllUserSettings,
  // Teams
  createTeam,
  getTeamByUserId,
  addTeamMember,
  removeTeamMember,
  deleteTeam,
  getTeamUserIds,
  // Quick Notes
  getQuickNotes,
  saveQuickNotes,
  // Templates
  getAllTemplates,
  // Export/Import
  exportData,
  importData,
  // Webhooks
  createWebhook,
  getWebhooksByUser,
  getActiveWebhooksForUser,
  updateWebhook,
  deleteWebhook,
  // Health
  healthCheck,
  // Utility
  generateId,
  closeDatabase,
  waitForDb
};
