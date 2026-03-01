const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create/open database file
const dbPath = path.join(__dirname, 'projects.db');
let dbReady = false;
let dbReadyPromise;

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    dbReadyPromise = initDatabase().then(() => {
      dbReady = true;
      console.log('Database ready for queries');
    });
  }
});

// Wait for database to be ready
async function waitForDb() {
  if (dbReady) return;
  if (dbReadyPromise) {
    await dbReadyPromise;
  } else {
    // Wait a bit more for the connection callback
    await new Promise(resolve => setTimeout(resolve, 100));
    if (dbReadyPromise) await dbReadyPromise;
  }
}

// Helper function to run queries with promises
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Helper function to generate UUID
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Create tables
async function initDatabase() {
  try {
    // Enable foreign keys
    await run('PRAGMA foreign_keys = ON');

    // Projects table
    await run(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        stakeholder TEXT,
        description TEXT,
        status TEXT DEFAULT 'not-started',
        priority TEXT DEFAULT 'medium',
        due_date TEXT,
        tags TEXT,
        project_order INTEGER DEFAULT 0,
        archived INTEGER DEFAULT 0,
        archived_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure stakeholder column exists for existing databases.
    const projectColumns = await all("PRAGMA table_info('projects')");
    const hasStakeholderColumn = projectColumns.some(col => col.name === 'stakeholder');
    if (!hasStakeholderColumn) {
      await run("ALTER TABLE projects ADD COLUMN stakeholder TEXT DEFAULT ''");
    }
    const hasArchivedColumn = projectColumns.some(col => col.name === 'archived');
    if (!hasArchivedColumn) {
      await run("ALTER TABLE projects ADD COLUMN archived INTEGER DEFAULT 0");
    }
    const hasArchivedAtColumn = projectColumns.some(col => col.name === 'archived_at');
    if (!hasArchivedAtColumn) {
      await run("ALTER TABLE projects ADD COLUMN archived_at TEXT");
    }

    // Tasks table
    await run(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        completed INTEGER DEFAULT 0,
        due_date TEXT,
        notes TEXT,
        priority TEXT DEFAULT 'none',
        recurring TEXT,
        blocked_by TEXT,
        task_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

    const taskColumns = await all("PRAGMA table_info('tasks')");
    const hasBlockedByColumn = taskColumns.some(col => col.name === 'blocked_by');
    if (!hasBlockedByColumn) {
      await run("ALTER TABLE tasks ADD COLUMN blocked_by TEXT");
    }

    // Documents table
    await run(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        doc_type TEXT NOT NULL,
        title TEXT,
        payload TEXT,
        file_name TEXT,
        mime_type TEXT,
        content_base64 TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

    // Migrate legacy schema that mistakenly limited one task per project.
    const taskIndexes = await all("PRAGMA index_list('tasks')");
    let hasUniqueProjectIdIndex = false;

    for (const idx of taskIndexes) {
      if (idx.unique !== 1 || idx.origin === 'pk') continue;
      const indexName = String(idx.name || '').replace(/'/g, "''");
      const indexColumns = await all(`PRAGMA index_info('${indexName}')`);
      const columnNames = indexColumns.map(col => col.name);
      if (columnNames.length === 1 && columnNames[0] === 'project_id') {
        hasUniqueProjectIdIndex = true;
        break;
      }
    }

    if (hasUniqueProjectIdIndex) {
      console.log('Migrating tasks table to remove UNIQUE(project_id) constraint');
      await run('BEGIN TRANSACTION');
      try {
        await run(`
          CREATE TABLE tasks_new (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            title TEXT NOT NULL,
            completed INTEGER DEFAULT 0,
            due_date TEXT,
            notes TEXT,
            priority TEXT DEFAULT 'none',
            recurring TEXT,
            blocked_by TEXT,
            task_order INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
          )
        `);

        await run(`
          INSERT INTO tasks_new (id, project_id, title, completed, due_date, notes, priority, recurring, blocked_by, task_order, created_at)
          SELECT id, project_id, title, completed, due_date, notes, priority, recurring, blocked_by, task_order, created_at
          FROM tasks
        `);

        await run('DROP TABLE tasks');
        await run('ALTER TABLE tasks_new RENAME TO tasks');
        await run('COMMIT');
      } catch (migrationError) {
        await run('ROLLBACK');
        throw migrationError;
      }
    }

    // Settings table
    await run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);

    // Quick notes table
    await run(`
      CREATE TABLE IF NOT EXISTS quick_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Templates table
    await run(`
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        tasks TEXT NOT NULL
      )
    `);

    // Initialize default templates if they don't exist
    const templateCount = await get('SELECT COUNT(*) as count FROM templates');
    if (templateCount.count === 0) {
      const templates = [
        {
          id: generateId(),
          name: 'Bug Report',
          tasks: JSON.stringify(['Reproduce issue', 'Identify root cause', 'Write fix', 'Add tests', 'Deploy'])
        },
        {
          id: generateId(),
          name: 'Feature Request',
          tasks: JSON.stringify(['Define requirements', 'Design solution', 'Implement', 'Test', 'Document'])
        },
        {
          id: generateId(),
          name: 'Meeting Notes',
          tasks: JSON.stringify(['Review agenda', 'Take notes', 'Action items', 'Follow up'])
        }
      ];

      for (const t of templates) {
        await run('INSERT INTO templates (id, name, tasks) VALUES (?, ?, ?)', [t.id, t.name, t.tasks]);
      }
    }

    // Initialize quick notes if doesn't exist
    const notesCount = await get('SELECT COUNT(*) as count FROM quick_notes');
    if (notesCount.count === 0) {
      await run('INSERT INTO quick_notes (content) VALUES (?)', ['']);
    }

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

// ========== PROJECT QUERIES ==========

async function getAllProjects(options = {}) {
  const { includeDocumentContent = false } = options;
  await waitForDb();
  const projects = await all(`
    SELECT * FROM projects ORDER BY project_order ASC, created_at DESC
  `);

  // Fetch tasks for each project
  const projectsWithTasks = await Promise.all(projects.map(async (project) => ({
    ...project,
    stakeholder: project.stakeholder || '',
    archived: project.archived === 1,
    archivedAt: project.archived_at || null,
    tags: project.tags ? JSON.parse(project.tags) : [],
    dueDate: project.due_date,
    tasks: await getProjectTasks(project.id),
    documents: await getProjectDocuments(project.id, { includeContent: includeDocumentContent })
  })));

  return projectsWithTasks;
}

async function getProjectById(id, options = {}) {
  const { includeDocumentContent = false } = options;
  await waitForDb();
  const project = await get('SELECT * FROM projects WHERE id = ?', [id]);
  if (!project) return null;

  const tasks = await getProjectTasks(id);
  const documents = await getProjectDocuments(id, { includeContent: includeDocumentContent });

  return {
    ...project,
    stakeholder: project.stakeholder || '',
    archived: project.archived === 1,
    archivedAt: project.archived_at || null,
    tags: project.tags ? JSON.parse(project.tags) : [],
    dueDate: project.due_date,
    tasks: tasks,
    documents
  };
}

async function createProject(project) {
  await waitForDb();
  const id = project.id || generateId();
  await run(`
    INSERT INTO projects (id, title, stakeholder, description, status, priority, due_date, tags, project_order, archived, archived_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
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

  return await getProjectById(id);
}

async function updateProject(id, updates) {
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
      if (updates.archivedAt !== undefined) {
        fields.push('archived_at = ?');
        values.push(updates.archivedAt);
      } else {
        fields.push('archived_at = CURRENT_TIMESTAMP');
      }
    } else {
      fields.push('archived_at = NULL');
    }
  }
  if (updates.archivedAt !== undefined && updates.archived === undefined) {
    fields.push('archived_at = ?');
    values.push(updates.archivedAt);
  }

  if (fields.length === 0) return await getProjectById(id);

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  await run(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`, values);

  return await getProjectById(id);
}

async function deleteProject(id) {
  await waitForDb();
  // Tasks will be deleted automatically due to CASCADE
  const result = await run('DELETE FROM projects WHERE id = ?', [id]);
  return result.changes > 0;
}

async function reorderProjects(projectOrders) {
  await waitForDb();
  for (const { id, order } of projectOrders) {
    await run('UPDATE projects SET project_order = ? WHERE id = ?', [order, id]);
  }
}

// ========== TASK QUERIES ==========

async function getProjectTasks(projectId) {
  await waitForDb();
  const tasks = await all(`
    SELECT * FROM tasks WHERE project_id = ? ORDER BY task_order ASC, created_at ASC
  `, [projectId]);

  return tasks.map(task => ({
    id: task.id,
    title: task.title,
    completed: task.completed === 1,
    dueDate: task.due_date,
    notes: task.notes,
    priority: task.priority,
    recurring: task.recurring,
    blockedBy: task.blocked_by || null
  }));
}

async function createTask(projectId, task) {
  await waitForDb();
  const id = task.id || generateId();

  let taskOrder = Number.isInteger(task.order) ? task.order : null;
  if (taskOrder === null) {
    const row = await get(
      'SELECT COALESCE(MAX(task_order), -1) AS max_order FROM tasks WHERE project_id = ?',
      [projectId]
    );
    taskOrder = (row?.max_order ?? -1) + 1;
  }

  await run(`
    INSERT INTO tasks (id, project_id, title, completed, due_date, notes, priority, recurring, blocked_by, task_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    projectId,
    task.title,
    task.completed ? 1 : 0,
    task.dueDate || null,
    task.notes || '',
    task.priority || 'none',
    task.recurring || null,
    task.blockedBy || null,
    taskOrder
  ]);

  return id;
}

async function updateTask(taskId, updates) {
  await waitForDb();
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

  if (fields.length === 0) return;

  values.push(taskId);

  await run(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, values);
}

async function deleteTask(taskId) {
  await waitForDb();
  const result = await run('DELETE FROM tasks WHERE id = ?', [taskId]);
  return result.changes > 0;
}

async function reorderTasks(projectId, taskOrders) {
  await waitForDb();
  await run('BEGIN TRANSACTION');
  try {
    for (const { id, order } of taskOrders) {
      await run(
        'UPDATE tasks SET task_order = ? WHERE id = ? AND project_id = ?',
        [order, id, projectId]
      );
    }
    await run('COMMIT');
  } catch (error) {
    await run('ROLLBACK');
    throw error;
  }
}

// ========== DOCUMENT QUERIES ==========

async function getProjectDocuments(projectId, options = {}) {
  const { includeContent = false } = options;
  await waitForDb();
  const rows = await all(`
    SELECT * FROM documents WHERE project_id = ? ORDER BY created_at ASC
  `, [projectId]);

  return rows.map(row => ({
    id: row.id,
    projectId: row.project_id,
    type: row.doc_type,
    title: row.title,
    createdAt: row.created_at,
    fileName: row.file_name,
    mimeType: row.mime_type,
    email: row.payload ? JSON.parse(row.payload) : null,
    hasContent: Boolean(row.content_base64),
    contentBase64: includeContent ? row.content_base64 : undefined
  }));
}

async function getDocumentById(id) {
  await waitForDb();
  const row = await get('SELECT * FROM documents WHERE id = ?', [id]);
  if (!row) return null;

  return {
    id: row.id,
    projectId: row.project_id,
    type: row.doc_type,
    title: row.title,
    createdAt: row.created_at,
    fileName: row.file_name,
    mimeType: row.mime_type,
    email: row.payload ? JSON.parse(row.payload) : null,
    hasContent: Boolean(row.content_base64),
    contentBase64: row.content_base64
  };
}

async function createDocument(projectId, doc) {
  await waitForDb();
  const id = doc.id || generateId();
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
    mimeType = doc.mimeType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
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

async function deleteDocument(id) {
  await waitForDb();
  const result = await run('DELETE FROM documents WHERE id = ?', [id]);
  return result.changes > 0;
}

// ========== SETTINGS QUERIES ==========

async function getSetting(key) {
  await waitForDb();
  const row = await get('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? JSON.parse(row.value) : null;
}

async function setSetting(key, value) {
  await waitForDb();
  const existing = await get('SELECT key FROM settings WHERE key = ?', [key]);
  if (existing) {
    await run('UPDATE settings SET value = ? WHERE key = ?', [JSON.stringify(value), key]);
  } else {
    await run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, JSON.stringify(value)]);
  }
}

async function getAllSettings() {
  await waitForDb();
  const rows = await all('SELECT * FROM settings');
  const settings = {};
  rows.forEach(row => {
    settings[row.key] = JSON.parse(row.value);
  });
  return settings;
}

// ========== QUICK NOTES QUERIES ==========

async function getQuickNotes() {
  await waitForDb();
  const note = await get('SELECT content FROM quick_notes ORDER BY id DESC LIMIT 1');
  return note ? note.content : '';
}

async function saveQuickNotes(content) {
  await waitForDb();
  // Update the most recent note or insert if none exists
  const existing = await get('SELECT id FROM quick_notes ORDER BY id DESC LIMIT 1');

  if (existing) {
    await run('UPDATE quick_notes SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [content, existing.id]);
  } else {
    await run('INSERT INTO quick_notes (content) VALUES (?)', [content]);
  }
}

// ========== TEMPLATES QUERIES ==========

async function getAllTemplates() {
  await waitForDb();
  const templates = await all('SELECT * FROM templates');
  return templates.map(t => ({
    id: t.id,
    name: t.name,
    tasks: JSON.parse(t.tasks)
  }));
}

// ========== EXPORT/IMPORT ==========

async function exportData() {
  await waitForDb();
  const projects = await getAllProjects({ includeDocumentContent: true });
  const settings = await getAllSettings();
  const quickNotes = await getQuickNotes();
  const templates = await getAllTemplates();

  return {
    version: '1.0',
    projects,
    settings,
    quickNotes,
    templates,
    exportedAt: new Date().toISOString()
  };
}

async function importData(data) {
  await waitForDb();
  // Clear existing data
  await run('DELETE FROM tasks');
  await run('DELETE FROM documents');
  await run('DELETE FROM projects');
  await run('DELETE FROM settings');

  // Import projects
  if (data.projects) {
    for (const project of data.projects) {
      await createProject(project);
      // Import tasks for this project
      if (project.tasks) {
        for (const task of project.tasks) {
          await createTask(project.id, task);
        }
      }
      // Import documents for this project
      if (project.documents) {
        for (const doc of project.documents) {
          await createDocument(project.id, doc);
        }
      }
    }
  }

  // Import settings
  if (data.settings) {
    for (const [key, value] of Object.entries(data.settings)) {
      await setSetting(key, value);
    }
  }

  // Import quick notes
  if (data.quickNotes !== undefined) {
    await saveQuickNotes(data.quickNotes);
  }
}

// Graceful shutdown
function closeDatabase() {
  return new Promise((resolve) => {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      } else {
        console.log('Database connection closed');
      }
      resolve();
    });
  });
}

module.exports = {
  // Projects
  getAllProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  reorderProjects,
  // Tasks
  getProjectTasks,
  createTask,
  updateTask,
  deleteTask,
  reorderTasks,
  // Documents
  getProjectDocuments,
  getDocumentById,
  createDocument,
  deleteDocument,
  // Settings
  getSetting,
  setSetting,
  getAllSettings,
  // Quick Notes
  getQuickNotes,
  saveQuickNotes,
  // Templates
  getAllTemplates,
  // Export/Import
  exportData,
  importData,
  // Utility
  generateId,
  closeDatabase,
  waitForDb
};
