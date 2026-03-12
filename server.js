const express = require('express');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');
const db = require('./database');

// Load bcryptjs (pure-JS implementation, works in serverless environments)
let bcrypt;
try {
  bcrypt = require('bcryptjs');
} catch {
  logger.error('bcryptjs not installed. Run: npm install bcryptjs');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3001;
const BCRYPT_ROUNDS = 12;

// ========== SECURITY MIDDLEWARE ==========

// Helmet for security headers
let helmet;
try {
  helmet = require('helmet');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false
  }));
} catch {
  logger.error('helmet is required but not installed. Run: npm install helmet');
  process.exit(1);
}

// Compression
let compression;
try {
  compression = require('compression');
  app.use(compression());
} catch {
  logger.warn('compression not installed — running without gzip');
}

// Rate limiting (disabled in test environment)
if (process.env.NODE_ENV !== 'test') {
  let rateLimit;
  try {
    rateLimit = require('express-rate-limit');

    const generalLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 200,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests, please try again later' }
    });

    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 20,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many authentication attempts, please try again later' }
    });

    const importLimiter = rateLimit({
      windowMs: 60 * 60 * 1000,
      max: 5,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Import rate limit exceeded' }
    });

    const adminLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 30,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many admin requests, please try again later' }
    });

    app.use('/api/auth/', authLimiter);
    app.use('/api/admin/', adminLimiter);
    app.use('/api/import', importLimiter);
    app.use('/api/', generalLimiter);
  } catch {
    logger.warn('express-rate-limit not installed — running without rate limiting');
  }
}

// Body parsing with size limits
app.use('/api/import', express.json({ limit: '10mb' }));
app.use('/api/projects/:projectId/documents', express.json({ limit: '10mb' }));
app.use(express.json({ limit: '2mb' }));

// Serve only the public directory
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  etag: true,
  lastModified: true
}));

// ========== INPUT VALIDATION ==========

let z;
try {
  z = require('zod');
} catch {
  logger.error('zod is required but not installed. Run: npm install zod');
  process.exit(1);
}

// Validation schemas
const VALID_STATUSES = ['backlog', 'not-started', 'in-progress', 'completed'];
const VALID_PRIORITIES = ['high', 'medium', 'low', 'none'];
const VALID_ROLES = ['admin', 'user'];

const VALID_SETTINGS_KEYS = [
  'theme', 'defaultView', 'sortBy', 'showCompleted', 'showArchived',
  'wipLimits', 'kanbanColumns', 'sidebarCollapsed', 'workspaceMode'
];

const VALID_GLOBAL_SETTINGS_KEYS = [
  'registrationEnabled', 'maxProjectsPerUser', 'maxTasksPerProject',
  'siteName', 'maintenanceMode'
];

function validate(schema, data) {
  if (!z.object) return { success: true, data };
  try {
    const result = schema.safeParse(data);
    return result;
  } catch {
    return { success: true, data };
  }
}

// Real schemas (only if zod is available)
let schemas = {};
if (z.object && z.string && typeof z.string === 'function') {
  try {
    schemas.register = z.object({
      username: z.string().min(3).max(50),
      email: z.string().email().max(255),
      password: z.string().min(8).max(128)
    });

    schemas.login = z.object({
      username: z.string().min(1).max(50),
      password: z.string().min(1).max(128)
    });

    schemas.createProject = z.object({
      title: z.string().min(1).max(500),
      stakeholder: z.string().max(200).optional(),
      description: z.string().max(10000).optional(),
      status: z.enum(VALID_STATUSES).optional(),
      priority: z.enum(VALID_PRIORITIES).optional(),
      dueDate: z.string().max(50).optional().nullable(),
      tags: z.array(z.string().max(100)).max(50).optional(),
      order: z.number().int().min(0).optional(),
      archived: z.boolean().optional(),
      archivedAt: z.string().optional().nullable()
    });

    schemas.updateProject = z.object({
      title: z.string().min(1).max(500).optional(),
      stakeholder: z.string().max(200).optional(),
      description: z.string().max(10000).optional(),
      status: z.enum(VALID_STATUSES).optional(),
      priority: z.enum(VALID_PRIORITIES).optional(),
      dueDate: z.string().max(50).optional().nullable(),
      tags: z.array(z.string().max(100)).max(50).optional(),
      order: z.number().int().min(0).optional(),
      archived: z.boolean().optional(),
      archivedAt: z.string().optional().nullable()
    });

    schemas.createTask = z.object({
      title: z.string().min(1).max(500),
      completed: z.boolean().optional(),
      dueDate: z.string().max(50).optional().nullable(),
      notes: z.string().max(10000).optional(),
      priority: z.enum(VALID_PRIORITIES).optional(),
      recurring: z.string().max(100).optional().nullable(),
      blockedBy: z.string().max(100).optional().nullable(),
      order: z.number().int().min(0).optional()
    });

    schemas.updateTask = z.object({
      title: z.string().min(1).max(500).optional(),
      completed: z.boolean().optional(),
      dueDate: z.string().max(50).optional().nullable(),
      notes: z.string().max(10000).optional(),
      priority: z.enum(VALID_PRIORITIES).optional(),
      recurring: z.string().max(100).optional().nullable(),
      blockedBy: z.string().max(100).optional().nullable()
    });

    schemas.reorderItem = z.object({
      id: z.string().uuid(),
      order: z.number().int().min(0)
    });

    schemas.createTeam = z.object({
      name: z.string().min(1).max(100)
    });
  } catch {
    schemas = {};
  }
}

// ========== AUTH MIDDLEWARE ==========

async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')
    || req.cookies?.session_token;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const session = await db.getSessionByToken(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  if (!session.approved) {
    return res.status(403).json({ error: 'Account pending approval' });
  }

  req.user = session;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function setSessionCookie(res, token, maxAge = 86400) {
  const isProduction = process.env.NODE_ENV === 'production';
  res.setHeader('Set-Cookie',
    `session_token=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${isProduction ? '; Secure' : ''}`
  );
}

async function resolveTeamScope(userId) {
  const workspaceMode = await db.getUserSetting(userId, 'workspaceMode');
  let teamUserIds = null;
  if (workspaceMode === 'team' || workspaceMode === null) {
    teamUserIds = await db.getTeamUserIds(userId);
  }
  return teamUserIds;
}

// Simple cookie parser (avoid extra dependency)
app.use((req, res, next) => {
  req.cookies = {};
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    cookieHeader.split(';').forEach(cookie => {
      const [name, ...rest] = cookie.trim().split('=');
      req.cookies[name] = rest.join('=');
    });
  }
  next();
});

// ========== COLD-START INITIALIZATION (for serverless / Vercel) ==========
// Kick off DB init + admin seeding as soon as the module is imported.
// This resolves before any request handler runs (see middleware below).
const initPromise = (async () => {
  await db.waitForDb();
  await seedAdminUser();
})();

// Block all API requests until initialization is complete.
// Static files (served above) bypass this intentionally.
app.use(async (req, res, next) => {
  try {
    await initPromise;
    next();
  } catch (err) {
    logger.error({ err }, 'Initialization failed');
    res.status(503).json({ error: 'Service unavailable — initialization failed' });
  }
});

// ========== AUTH ENDPOINTS ==========

app.post('/api/auth/register', async (req, res) => {
  try {
    if (schemas.register) {
      const result = schemas.register.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid input', details: result.error.issues });
      }
    }

    const { username, email, password } = req.body;

    // Check if username or email already exists
    const existingUser = await db.getUserByUsername(username);
    if (existingUser) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const existingEmail = await db.getUserByEmail(email);
    if (existingEmail) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await db.createUser(username, email, passwordHash, 'user', false);

    res.status(201).json({
      message: 'Registration successful. Your account is pending admin approval.',
      user: { id: user.id, username: user.username, email: user.email }
    });
  } catch (error) {
    logger.error({ err: error }, 'Registration error');
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    if (schemas.login) {
      const result = schemas.login.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid input' });
      }
    }

    const { username, password } = req.body;

    const user = await db.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    if (!user.approved) {
      return res.status(403).json({ error: 'Account pending admin approval' });
    }

    const session = await db.createSession(user.id);

    setSessionCookie(res, session.token);

    res.json({
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Login error');
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
      || req.cookies?.session_token;
    await db.deleteSession(token);

    setSessionCookie(res, '', 0);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Logout error');
    res.status(500).json({ error: 'Logout failed' });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  res.json({
    id: req.user.userId,
    username: req.user.username,
    email: req.user.email,
    role: req.user.role
  });
});

app.put('/api/auth/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword || newPassword.length < 8 || newPassword.length > 128) {
      return res.status(400).json({ error: 'New password must be between 8 and 128 characters' });
    }

    const user = await db.getUserById(req.user.userId);
    const passwordMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await db.updateUser(req.user.userId, { passwordHash });

    // Invalidate all other sessions
    await db.deleteUserSessions(req.user.userId);
    const session = await db.createSession(req.user.userId);

    setSessionCookie(res, session.token);

    res.json({ success: true, token: session.token });
  } catch (error) {
    logger.error({ err: error }, 'Password change error');
    res.status(500).json({ error: 'Password change failed' });
  }
});

// ========== ADMIN ENDPOINTS ==========

app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await db.getAllUsers();
    res.json(users);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching users');
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.put('/api/admin/users/:id/approve', requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = await db.getUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    await db.updateUser(req.params.id, { approved: true });
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error approving user');
    res.status(500).json({ error: 'Failed to approve user' });
  }
});

app.put('/api/admin/users/:id/role', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Prevent demoting yourself
    if (req.params.id === req.user.userId && role !== 'admin') {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    const user = await db.getUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    await db.updateUser(req.params.id, { role });
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error changing role');
    res.status(500).json({ error: 'Failed to change role' });
  }
});

app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Prevent self-deletion
    if (req.params.id === req.user.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const deleted = await db.deleteUser(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting user');
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ========== TEAM ENDPOINTS (authenticated) ==========

app.post('/api/teams', requireAuth, async (req, res) => {
  try {
    if (schemas.createTeam) {
      const result = schemas.createTeam.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid input', details: result.error.issues });
      }
    }

    const { name } = req.body;
    const team = await db.createTeam(name, req.user.userId);
    res.status(201).json(team);
  } catch (error) {
    if (error.message && error.message.includes('already belongs to a team')) {
      return res.status(409).json({ error: error.message });
    }
    logger.error({ err: error }, 'Error creating team');
    res.status(500).json({ error: 'Failed to create team' });
  }
});

app.get('/api/teams/mine', requireAuth, async (req, res) => {
  try {
    const team = await db.getTeamByUserId(req.user.userId);
    if (!team) {
      return res.json({ team: null });
    }
    res.json(team);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching team');
    res.status(500).json({ error: 'Failed to fetch team' });
  }
});

app.post('/api/teams/:id/members', requireAuth, async (req, res) => {
  try {
    const teamId = req.params.id;

    // Verify caller is team owner or admin
    const team = await db.getTeamByUserId(req.user.userId);
    if (!team || team.id !== teamId) {
      return res.status(403).json({ error: 'Not a member of this team' });
    }
    if (team.myRole !== 'owner' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only team owner or admin can add members' });
    }

    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const user = await db.getUserByUsername(username);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (!user.approved) {
      return res.status(400).json({ error: 'User account is not approved' });
    }

    await db.addTeamMember(teamId, user.id);
    res.json({ success: true });
  } catch (error) {
    if (error.message && error.message.includes('already belongs to a team')) {
      return res.status(409).json({ error: error.message });
    }
    logger.error({ err: error }, 'Error adding team member');
    res.status(500).json({ error: 'Failed to add team member' });
  }
});

app.delete('/api/teams/:id/members/:userId', requireAuth, async (req, res) => {
  try {
    const teamId = req.params.id;
    const targetUserId = req.params.userId;

    // Verify caller is team owner, admin, or removing themselves
    const team = await db.getTeamByUserId(req.user.userId);
    if (!team || team.id !== teamId) {
      return res.status(403).json({ error: 'Not a member of this team' });
    }

    const isSelf = targetUserId === req.user.userId;
    if (!isSelf && team.myRole !== 'owner' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only team owner or admin can remove members' });
    }

    // Cannot remove team owner
    if (team.createdBy === targetUserId) {
      return res.status(400).json({ error: 'Cannot remove team owner. Delete the team instead.' });
    }

    const removed = await db.removeTeamMember(teamId, targetUserId);
    if (!removed) {
      return res.status(404).json({ error: 'Member not found in team' });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error removing team member');
    res.status(500).json({ error: 'Failed to remove team member' });
  }
});

app.post('/api/teams/:id/leave', requireAuth, async (req, res) => {
  try {
    const teamId = req.params.id;

    const team = await db.getTeamByUserId(req.user.userId);
    if (!team || team.id !== teamId) {
      return res.status(403).json({ error: 'Not a member of this team' });
    }

    // Cannot leave if owner
    if (team.createdBy === req.user.userId) {
      return res.status(400).json({ error: 'Team owner cannot leave. Delete the team or transfer ownership first.' });
    }

    await db.removeTeamMember(teamId, req.user.userId);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error leaving team');
    res.status(500).json({ error: 'Failed to leave team' });
  }
});

app.delete('/api/teams/:id', requireAuth, async (req, res) => {
  try {
    const teamId = req.params.id;

    // Verify caller is team owner or admin
    const team = await db.getTeamByUserId(req.user.userId);
    if (!team || team.id !== teamId) {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Not authorized to delete this team' });
      }
    } else if (team.myRole !== 'owner' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only team owner or admin can delete the team' });
    }

    await db.deleteTeam(teamId);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting team');
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

// ========== PROJECT ENDPOINTS (authenticated) ==========

app.get('/api/projects', requireAuth, async (req, res) => {
  try {
    const teamUserIds = await resolveTeamScope(req.user.userId);
    const projects = await db.getAllProjects(req.user.userId, { teamUserIds });
    res.json(projects);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching projects');
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

app.get('/api/projects/:id', requireAuth, async (req, res) => {
  try {
    const teamUserIds = await resolveTeamScope(req.user.userId);
    const project = await db.getProjectById(req.params.id, req.user.userId, { teamUserIds });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching project');
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

app.post('/api/projects', requireAuth, async (req, res) => {
  try {
    if (schemas.createProject) {
      const result = schemas.createProject.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid input', details: result.error.issues });
      }
    }

    const project = await db.createProject(req.user.userId, req.body);
    res.status(201).json(project);
  } catch (error) {
    logger.error({ err: error }, 'Error creating project');
    res.status(500).json({ error: 'Failed to create project' });
  }
});

app.put('/api/projects/:id', requireAuth, async (req, res) => {
  try {
    if (schemas.updateProject) {
      const result = schemas.updateProject.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid input', details: result.error.issues });
      }
    }

    const project = await db.updateProject(req.params.id, req.user.userId, req.body);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (error) {
    logger.error({ err: error }, 'Error updating project');
    res.status(500).json({ error: 'Failed to update project' });
  }
});

app.delete('/api/projects/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await db.deleteProject(req.params.id, req.user.userId);
    if (!deleted) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting project');
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

app.post('/api/projects/reorder', requireAuth, async (req, res) => {
  try {
    if (schemas.reorderItem && Array.isArray(req.body)) {
      for (const item of req.body) {
        const result = schemas.reorderItem.safeParse(item);
        if (!result.success) {
          return res.status(400).json({ error: 'Invalid reorder data' });
        }
      }
      if (req.body.length > 1000) {
        return res.status(400).json({ error: 'Too many items to reorder' });
      }
    }

    await db.reorderProjects(req.user.userId, req.body);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error reordering projects');
    res.status(500).json({ error: 'Failed to reorder projects' });
  }
});

// ========== TASK ENDPOINTS (authenticated) ==========

app.get('/api/projects/:projectId/tasks', requireAuth, async (req, res) => {
  try {
    const tasks = await db.getProjectTasks(req.params.projectId, req.user.userId);
    if (tasks === null) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(tasks);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching tasks');
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

app.post('/api/projects/:projectId/tasks', requireAuth, async (req, res) => {
  try {
    if (schemas.createTask) {
      const result = schemas.createTask.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid input', details: result.error.issues });
      }
    }

    const taskId = await db.createTask(req.params.projectId, req.user.userId, req.body);
    if (taskId === null) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.status(201).json({ id: taskId });
  } catch (error) {
    logger.error({ err: error }, 'Error creating task');
    res.status(500).json({ error: 'Failed to create task' });
  }
});

app.put('/api/tasks/:id', requireAuth, async (req, res) => {
  try {
    if (schemas.updateTask) {
      const result = schemas.updateTask.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid input', details: result.error.issues });
      }
    }

    const updated = await db.updateTask(req.params.id, req.user.userId, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error updating task');
    res.status(500).json({ error: 'Failed to update task' });
  }
});

app.delete('/api/tasks/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await db.deleteTask(req.params.id, req.user.userId);
    if (!deleted) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting task');
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

app.post('/api/projects/:projectId/tasks/reorder', requireAuth, async (req, res) => {
  try {
    const success = await db.reorderTasks(req.params.projectId, req.user.userId, req.body);
    if (!success) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error reordering tasks');
    res.status(500).json({ error: 'Failed to reorder tasks' });
  }
});

// ========== DOCUMENT ENDPOINTS (authenticated) ==========

app.get('/api/projects/:projectId/documents', requireAuth, async (req, res) => {
  try {
    const documents = await db.getProjectDocuments(req.params.projectId, req.user.userId, { includeContent: false });
    if (documents === null) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(documents);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching documents');
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

app.post('/api/projects/:projectId/documents', requireAuth, async (req, res) => {
  try {
    // Validate MIME type for docx uploads
    if (req.body.type === 'docx' && req.body.mimeType && !ALLOWED_MIME_TYPES.has(req.body.mimeType)) {
      return res.status(400).json({ error: 'Unsupported MIME type' });
    }
    const documentId = await db.createDocument(req.params.projectId, req.user.userId, req.body);
    if (documentId === null) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.status(201).json({ id: documentId });
  } catch (error) {
    logger.error({ err: error }, 'Error creating document');
    res.status(500).json({ error: 'Failed to create document' });
  }
});

app.delete('/api/documents/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await db.deleteDocument(req.params.id, req.user.userId);
    if (!deleted) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting document');
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Document download with sanitized headers
const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf',
  'text/plain',
  'application/octet-stream'
]);

app.get('/api/documents/:id/download', requireAuth, async (req, res) => {
  try {
    const document = await db.getDocumentById(req.params.id, req.user.userId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    if (document.type !== 'docx' || !document.contentBase64) {
      return res.status(400).json({ error: 'Document is not downloadable' });
    }

    const buffer = Buffer.from(document.contentBase64, 'base64');

    // Sanitize filename: only allow safe characters
    const rawName = document.fileName || 'document.docx';
    const safeFileName = rawName.replace(/[^\w.\-]/g, '_').replace(/\.\./g, '_').substring(0, 200);
    const encodedFileName = encodeURIComponent(safeFileName);

    // Whitelist MIME type
    const mimeType = ALLOWED_MIME_TYPES.has(document.mimeType)
      ? document.mimeType
      : 'application/octet-stream';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (error) {
    logger.error({ err: error }, 'Error downloading document');
    res.status(500).json({ error: 'Failed to download document' });
  }
});

// ========== SETTINGS ENDPOINTS ==========

// User settings (authenticated)
app.get('/api/settings', requireAuth, async (req, res) => {
  try {
    const settings = await db.getAllUserSettings(req.user.userId);
    res.json(settings);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching settings');
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

app.get('/api/settings/:key', requireAuth, async (req, res) => {
  try {
    if (!VALID_SETTINGS_KEYS.includes(req.params.key)) {
      return res.status(400).json({ error: 'Invalid settings key' });
    }
    const value = await db.getUserSetting(req.user.userId, req.params.key);
    res.json({ value });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching setting');
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

app.post('/api/settings/:key', requireAuth, async (req, res) => {
  try {
    if (!VALID_SETTINGS_KEYS.includes(req.params.key)) {
      return res.status(400).json({ error: 'Invalid settings key' });
    }
    await db.setUserSetting(req.user.userId, req.params.key, req.body.value);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error saving setting');
    res.status(500).json({ error: 'Failed to save setting' });
  }
});

// Global settings (admin only)
app.get('/api/admin/settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const settings = await db.getAllGlobalSettings();
    res.json(settings);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching global settings');
    res.status(500).json({ error: 'Failed to fetch global settings' });
  }
});

app.post('/api/admin/settings/:key', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!VALID_GLOBAL_SETTINGS_KEYS.includes(req.params.key)) {
      return res.status(400).json({ error: 'Invalid global settings key' });
    }
    await db.setGlobalSetting(req.params.key, req.body.value);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error saving global setting');
    res.status(500).json({ error: 'Failed to save global setting' });
  }
});

// ========== QUICK NOTES ENDPOINTS (authenticated) ==========

app.get('/api/notes', requireAuth, async (req, res) => {
  try {
    const content = await db.getQuickNotes(req.user.userId);
    res.json({ content });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching notes');
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

app.post('/api/notes', requireAuth, async (req, res) => {
  try {
    await db.saveQuickNotes(req.user.userId, req.body.content);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error saving notes');
    res.status(500).json({ error: 'Failed to save notes' });
  }
});

// ========== TEMPLATES ENDPOINTS ==========

app.get('/api/templates', requireAuth, async (req, res) => {
  try {
    const templates = await db.getAllTemplates();
    res.json(templates);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching templates');
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// ========== EXPORT/IMPORT ENDPOINTS (authenticated) ==========

app.get('/api/export', requireAuth, async (req, res) => {
  try {
    const data = await db.exportData(req.user.userId);
    res.json(data);
  } catch (error) {
    logger.error({ err: error }, 'Error exporting data');
    res.status(500).json({ error: 'Failed to export data' });
  }
});

app.post('/api/import', requireAuth, async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Invalid import data' });
    }
    await db.importData(req.user.userId, req.body);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error importing data');
    res.status(500).json({ error: 'Failed to import data' });
  }
});

// ========== HEALTH CHECK ==========

app.get('/api/health', async (req, res) => {
  const health = await db.healthCheck();
  res.status(health.status === 'ok' ? 200 : 503).json(health);
});

// ========== SERVE FRONTEND ==========

// SPA fallback — serve index.html for non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========== START SERVER ==========

async function seedAdminUser() {
  const adminUser = process.env.ADMIN_USER;
  const adminPass = process.env.ADMIN_PASS;

  if (!adminUser || !adminPass) {
    logger.warn('ADMIN_USER and ADMIN_PASS env vars not set — skipping admin seed');
    return;
  }

  const existing = await db.getUserByUsername(adminUser);
  if (existing) return;

  const passwordHash = await bcrypt.hash(adminPass, BCRYPT_ROUNDS);
  await db.createUser(adminUser, `${adminUser}@admin.local`, passwordHash, 'admin', true);
  logger.info({ username: adminUser }, 'Admin user created');
}

async function startServer() {
  logger.info('Waiting for database to initialize...');
  await initPromise;
  logger.info('Database ready');

  const server = app.listen(PORT, () => {
    logger.info({ port: PORT, database: 'projects.db', auth: 'session-based' }, 'Project Overviewer server running');
  });

  // Graceful shutdown with request draining
  async function shutdown(signal) {
    logger.info({ signal }, 'Shutting down gracefully...');
    server.close(async () => {
      await db.closeDatabase();
      logger.info('Server stopped');
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Export app for Vercel (module import) while still supporting `node server.js` locally.
module.exports = app;

if (require.main === module) {
  startServer().catch(err => {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  });
}