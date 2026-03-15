const express = require('express');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');
const db = require('./database');
const createAdminRouter = require('./routes/admin');
const createAuthRouter = require('./routes/auth');
const createDocumentsRouters = require('./routes/documents');
const createExportImportRouter = require('./routes/export-import');
const createNotesRouter = require('./routes/notes');
const createProjectsRouter = require('./routes/projects');
const createSettingsRouter = require('./routes/settings');
const createTasksRouters = require('./routes/tasks');
const createTeamsRouter = require('./routes/teams');
const createTemplatesRouter = require('./routes/templates');

// Load bcryptjs (pure-JS implementation, works in serverless environments)
let bcrypt;
try {
  bcrypt = require('bcryptjs');
} catch {
  logger.error('bcryptjs not installed. Run: npm install bcryptjs');
  process.exit(1);
}

let mammoth = null;
try {
  mammoth = require('mammoth');
} catch {
  logger.warn('mammoth not installed — docx previews will fall back to download only');
}

const app = express();
const PORT = process.env.PORT || 3001;
const BCRYPT_ROUNDS = 12;
const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

app.disable('x-powered-by');

// ========== SECURITY MIDDLEWARE ==========

// Helmet for security headers
let helmet;
try {
  helmet = require('helmet');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
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

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  next();
});

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
const DATE_INPUT_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf',
  'text/plain',
  'application/octet-stream'
]);

const VALID_SETTINGS_KEYS = [
  'theme', 'defaultView', 'sortBy', 'showCompleted', 'showArchived',
  'wipLimits', 'kanbanColumns', 'sidebarCollapsed', 'workspaceMode'
];

const VALID_GLOBAL_SETTINGS_KEYS = [
  'registrationEnabled', 'maxProjectsPerUser', 'maxTasksPerProject',
  'siteName', 'maintenanceMode'
];

function isSerializedJsonWithinLimit(value, maxBytes) {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8') <= maxBytes;
  } catch {
    return false;
  }
}

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
    const dueDateSchema = z.string().regex(DATE_INPUT_REGEX).max(10).nullable();
    const emailDateSchema = z.union([z.string().regex(DATE_INPUT_REGEX).max(10), z.literal(''), z.null()]);
    const archivedAtSchema = z.string().max(50).optional().nullable();
    const projectTagSchema = z.array(z.string().max(100)).max(50).optional();
    const importTaskSchema = z.object({
      title: z.string().min(1).max(500),
      completed: z.boolean().optional(),
      dueDate: dueDateSchema.optional(),
      notes: z.string().max(10000).optional(),
      priority: z.enum(VALID_PRIORITIES).optional(),
      recurring: z.string().max(100).optional().nullable(),
      blockedBy: z.string().max(100).optional().nullable(),
      order: z.number().int().min(0).optional()
    });
    const importEmailDocumentSchema = z.object({
      type: z.literal('email'),
      title: z.string().max(500).optional(),
      email: z.object({
        subject: z.string().max(500).optional(),
        from: z.string().max(255).optional(),
        to: z.string().max(255).optional(),
        date: emailDateSchema.optional(),
        body: z.string().max(10000).optional()
      }).optional()
    });
    const importDocxDocumentSchema = z.object({
      type: z.literal('docx'),
      title: z.string().max(500).optional(),
      fileName: z.string().max(255).optional(),
      mimeType: z.string().refine(value => ALLOWED_MIME_TYPES.has(value), 'Unsupported MIME type').optional(),
      contentBase64: z.string().max(10 * 1024 * 1024).optional()
    });
    const createEmailDocumentSchema = z.object({
      type: z.literal('email'),
      title: z.string().max(500).optional(),
      email: z.object({
        subject: z.string().max(500).optional(),
        from: z.string().max(255).optional(),
        to: z.string().max(255).optional(),
        date: emailDateSchema.optional(),
        body: z.string().max(10000).optional()
      }).optional()
    });
    const createDocxDocumentSchema = z.object({
      type: z.literal('docx'),
      title: z.string().max(500).optional(),
      fileName: z.string().max(255).optional(),
      mimeType: z.string().refine(value => ALLOWED_MIME_TYPES.has(value), 'Unsupported MIME type').optional(),
      contentBase64: z.string().max(10 * 1024 * 1024)
    });

    schemas.register = z.object({
      username: z.string().min(3).max(50),
      email: z.string().email().max(255),
      password: z.string().min(8).max(128)
    });

    schemas.login = z.object({
      username: z.string().min(1).max(50),
      password: z.string().min(1).max(128)
    });

    schemas.changePassword = z.object({
      currentPassword: z.string().min(1).max(128),
      newPassword: z.string().min(8).max(128)
    }).refine(data => data.currentPassword !== data.newPassword, {
      message: 'New password must be different from the current password',
      path: ['newPassword']
    });

    schemas.createProject = z.object({
      title: z.string().min(1).max(500),
      stakeholder: z.string().max(200).optional(),
      description: z.string().max(10000).optional(),
      status: z.enum(VALID_STATUSES).optional(),
      priority: z.enum(VALID_PRIORITIES).optional(),
      dueDate: dueDateSchema.optional(),
      tags: projectTagSchema,
      order: z.number().int().min(0).optional(),
      archived: z.boolean().optional(),
      archivedAt: archivedAtSchema
    });

    schemas.updateProject = z.object({
      title: z.string().min(1).max(500).optional(),
      stakeholder: z.string().max(200).optional(),
      description: z.string().max(10000).optional(),
      status: z.enum(VALID_STATUSES).optional(),
      priority: z.enum(VALID_PRIORITIES).optional(),
      dueDate: dueDateSchema.optional(),
      tags: projectTagSchema,
      order: z.number().int().min(0).optional(),
      archived: z.boolean().optional(),
      archivedAt: archivedAtSchema
    });

    schemas.createTask = z.object({
      title: z.string().min(1).max(500),
      completed: z.boolean().optional(),
      dueDate: dueDateSchema.optional(),
      notes: z.string().max(10000).optional(),
      priority: z.enum(VALID_PRIORITIES).optional(),
      recurring: z.string().max(100).optional().nullable(),
      blockedBy: z.string().max(100).optional().nullable(),
      order: z.number().int().min(0).optional()
    });

    schemas.updateTask = z.object({
      title: z.string().min(1).max(500).optional(),
      completed: z.boolean().optional(),
      dueDate: dueDateSchema.optional(),
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

    schemas.addTeamMember = z.object({
      username: z.string().min(3).max(50)
    });

    schemas.createDocument = z.discriminatedUnion('type', [
      createEmailDocumentSchema,
      createDocxDocumentSchema
    ]);

    schemas.notes = z.object({
      content: z.string().max(100000)
    });

    schemas.importData = z.object({
      version: z.string().max(20).optional(),
      projects: z.array(z.object({
        title: z.string().min(1).max(500),
        stakeholder: z.string().max(200).optional(),
        description: z.string().max(10000).optional(),
        status: z.enum(VALID_STATUSES).optional(),
        priority: z.enum(VALID_PRIORITIES).optional(),
        dueDate: dueDateSchema.optional(),
        tags: projectTagSchema,
        order: z.number().int().min(0).optional(),
        archived: z.boolean().optional(),
        archivedAt: archivedAtSchema,
        tasks: z.array(importTaskSchema).max(1000).optional(),
        documents: z.array(z.discriminatedUnion('type', [
          importEmailDocumentSchema,
          importDocxDocumentSchema
        ])).max(200).optional()
      })).max(2000).optional(),
      settings: z.record(z.string(), z.unknown()).optional(),
      quickNotes: z.string().max(100000).optional(),
      templates: z.array(z.object({
        name: z.string().max(200),
        tasks: z.array(z.string().max(500)).max(100)
      })).max(100).optional(),
      exportedAt: z.string().max(100).optional()
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

function getExpectedOrigin(req) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || req.protocol || 'http')
    .split(',')[0]
    .trim();
  const forwardedHost = req.headers['x-forwarded-host'];
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || req.headers.host || '')
    .split(',')[0]
    .trim();
  return host ? `${protocol}://${host}` : null;
}

function parseHeaderOrigin(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function requireSameOriginCookieWrite(req, res, next) {
  if (SAFE_HTTP_METHODS.has(req.method)) return next();
  if (req.path === '/auth/login' || req.path === '/auth/register') return next();

  const authHeader = req.headers.authorization;
  const hasBearerAuth = typeof authHeader === 'string' && authHeader.startsWith('Bearer ');
  if (hasBearerAuth || !req.cookies?.session_token) {
    return next();
  }

  const secFetchSite = req.headers['sec-fetch-site'];
  if (secFetchSite && secFetchSite !== 'same-origin') {
    return res.status(403).json({ error: 'Cross-site request rejected' });
  }

  if (secFetchSite === 'same-origin') {
    return next();
  }

  const sourceOrigin = parseHeaderOrigin(req.headers.origin) || parseHeaderOrigin(req.headers.referer);
  const expectedOrigin = getExpectedOrigin(req);
  if (!sourceOrigin || !expectedOrigin || sourceOrigin !== expectedOrigin) {
    return res.status(403).json({ error: 'Cross-site request rejected' });
  }

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

function getSafeDocumentMimeType(mimeType) {
  return ALLOWED_MIME_TYPES.has(mimeType) ? mimeType : 'application/octet-stream';
}

function getSafeDocumentFileName(document) {
  const fallback = document.mimeType === 'application/pdf' ? 'document.pdf' : 'document.docx';
  const rawName = document.fileName || fallback;
  return rawName.replace(/[^\w.\-]/g, '_').replace(/\.\./g, '_').substring(0, 200);
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

app.use('/api', requireSameOriginCookieWrite);

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

const authRouter = createAuthRouter({
  db,
  logger,
  schemas,
  bcrypt,
  bcryptRounds: BCRYPT_ROUNDS,
  requireAuth,
  setSessionCookie
});
const adminRouter = createAdminRouter({
  db,
  logger,
  requireAuth,
  requireAdmin,
  validRoles: VALID_ROLES,
  validGlobalSettingsKeys: VALID_GLOBAL_SETTINGS_KEYS,
  isSerializedJsonWithinLimit
});
const projectsRouter = createProjectsRouter({ db, logger, schemas, requireAuth });
const { projectTasksRouter, tasksRouter } = createTasksRouters({ db, logger, schemas, requireAuth });
const { projectDocumentsRouter, documentsRouter } = createDocumentsRouters({
  db,
  logger,
  schemas,
  requireAuth,
  mammoth,
  allowedMimeTypes: ALLOWED_MIME_TYPES
});
const teamsRouter = createTeamsRouter({ db, logger, schemas, requireAuth });
const settingsRouter = createSettingsRouter({
  db,
  logger,
  requireAuth,
  validSettingsKeys: VALID_SETTINGS_KEYS,
  isSerializedJsonWithinLimit
});
const notesRouter = createNotesRouter({ db, logger, schemas, requireAuth });
const templatesRouter = createTemplatesRouter({ db, logger, requireAuth });
const exportImportRouter = createExportImportRouter({ db, logger, schemas, requireAuth });

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/projects/:projectId/tasks', projectTasksRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/projects/:projectId/documents', projectDocumentsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/notes', notesRouter);
app.use('/api/templates', templatesRouter);
app.use('/api', exportImportRouter);

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
