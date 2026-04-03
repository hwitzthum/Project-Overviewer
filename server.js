const express = require('express');
const fs = require('fs');
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
const createWebhooksRouter = require('./routes/webhooks');
const eventBus = require('./event-bus');
const createWebhookDispatcher = require('./webhook-dispatcher');
const { VALID_SETTINGS_KEYS, VALID_WEBHOOK_EVENTS } = require('./app-constants');
const { logSecurityEvent, fingerprintToken } = require('./security-events');
const { SESSION_ABSOLUTE_TIMEOUT_SECONDS } = require('./session-config');
const {
  MAX_PASSWORD_LENGTH,
  MIN_ADMIN_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  validatePasswordPolicy
} = require('./password-policy');

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
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const BCRYPT_ROUNDS = 12;
const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const API_BASE_PATHS = ['/api', '/api/v1'];
const PUBLIC_DIR = path.join(__dirname, 'public');
const DIST_DIR = path.join(PUBLIC_DIR, 'dist');
const ASSET_MANIFEST_PATH = path.join(DIST_DIR, 'asset-manifest.json');
function normalizeOrigin(value) {
  const normalized = String(value || '').trim().replace(/\/+$/, '');
  if (!normalized) return null;
  try {
    return new URL(normalized).origin;
  } catch {
    throw new Error(`Invalid APP_ORIGIN value: ${value}`);
  }
}

function getConfiguredAppOrigin() {
  if (process.env.APP_ORIGIN) {
    return normalizeOrigin(process.env.APP_ORIGIN);
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return normalizeOrigin(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  }
  return null;
}

const APP_ORIGIN = getConfiguredAppOrigin();

function parseTrustProxy(value) {
  if (value === undefined || value === null || value === '') return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : value;
}

app.disable('x-powered-by');

function getConfiguredTrustProxy() {
  if (process.env.TRUST_PROXY !== undefined && process.env.TRUST_PROXY !== '') {
    return parseTrustProxy(process.env.TRUST_PROXY);
  }
  if (process.env.VERCEL === '1') {
    return 1;
  }
  return false;
}

const trustProxy = getConfiguredTrustProxy();
if (trustProxy !== false) {
  app.set('trust proxy', trustProxy);
}

if (process.env.NODE_ENV === 'production' && !APP_ORIGIN) {
  throw new Error('APP_ORIGIN must be set in production, or VERCEL_PROJECT_PRODUCTION_URL must be available');
}

if (process.env.NODE_ENV === 'production' && trustProxy === true) {
  throw new Error('TRUST_PROXY=true is too broad in production; set TRUST_PROXY to the actual proxy hop count or subnet');
}

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
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
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

    const webhookLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Webhook rate limit exceeded' }
    });

    app.use('/api/auth/', authLimiter);
    app.use('/api/v1/auth/', authLimiter);
    app.use('/api/admin/', adminLimiter);
    app.use('/api/v1/admin/', adminLimiter);
    app.use('/api/webhooks', webhookLimiter);
    app.use('/api/v1/webhooks', webhookLimiter);
    app.use('/api/import', importLimiter);
    app.use('/api/v1/import', importLimiter);
    app.use('/api/', generalLimiter);
  } catch {
    logger.warn('express-rate-limit not installed — running without rate limiting');
  }
}

// Body parsing with size limits
app.use('/api/import', express.json({ limit: '10mb' }));
app.use('/api/v1/import', express.json({ limit: '10mb' }));
app.use('/api/projects/:projectId/documents', express.json({ limit: '10mb' }));
app.use('/api/v1/projects/:projectId/documents', express.json({ limit: '10mb' }));
app.use(express.json({ limit: '2mb' }));

function readCookieValue(cookieHeader, name) {
  if (!cookieHeader || typeof cookieHeader !== 'string') return null;
  const prefix = `${name}=`;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

let cachedAssetManifest = null;
let cachedAssetManifestMtime = null;
const htmlTemplateCache = new Map();

function getAssetManifest() {
  try {
    const stats = fs.statSync(ASSET_MANIFEST_PATH);
    const mtime = stats.mtimeMs;
    if (cachedAssetManifest && cachedAssetManifestMtime === mtime) {
      return cachedAssetManifest;
    }

    const manifest = JSON.parse(fs.readFileSync(ASSET_MANIFEST_PATH, 'utf8'));
    cachedAssetManifest = manifest;
    cachedAssetManifestMtime = mtime;
    return manifest;
  } catch {
    return {
      buildId: 'dev',
      bundles: {
        'boot.bundle.js': 'boot.bundle.js',
        'app-shell.bundle.js': 'app-shell.bundle.js',
        'app.bundle.js': 'app.bundle.js',
        'admin.bundle.js': 'admin.bundle.js',
        'login.bundle.js': 'login.bundle.js',
        'register.bundle.js': 'register.bundle.js'
      }
    };
  }
}

function injectAssetUrls(html) {
  const manifest = getAssetManifest();
  const buildVersion = encodeURIComponent(manifest.buildId || 'dev');
  const bundleMap = manifest.bundles || {};

  return html
    .replaceAll('/css/theme.css', `/css/theme.css?v=${buildVersion}`)
    .replaceAll('/css/app.css', `/css/app.css?v=${buildVersion}`)
    .replaceAll('/css/auth.css', `/css/auth.css?v=${buildVersion}`)
    .replaceAll('/dist/boot.bundle.js', `/dist/${bundleMap['boot.bundle.js'] || 'boot.bundle.js'}`)
    .replaceAll('/dist/app-shell.bundle.js', `/dist/${bundleMap['app-shell.bundle.js'] || 'app-shell.bundle.js'}`)
    .replaceAll('/dist/app.bundle.js', `/dist/${bundleMap['app.bundle.js'] || 'app.bundle.js'}`)
    .replaceAll('/dist/admin.bundle.js', `/dist/${bundleMap['admin.bundle.js'] || 'admin.bundle.js'}`)
    .replaceAll('/dist/login.bundle.js', `/dist/${bundleMap['login.bundle.js'] || 'login.bundle.js'}`)
    .replaceAll('/dist/register.bundle.js', `/dist/${bundleMap['register.bundle.js'] || 'register.bundle.js'}`);
}

function sendHtmlPage(res, fileName, options = {}) {
  const { protectedPage = false } = options;
  res.setHeader(
    'Cache-Control',
    protectedPage ? 'private, no-store, max-age=0, must-revalidate' : 'no-store, max-age=0, must-revalidate'
  );
  res.setHeader('Pragma', 'no-cache');
  if (protectedPage) {
    res.setHeader('Vary', 'Cookie');
  }
  const useCache = process.env.NODE_ENV === 'production';
  if (useCache && htmlTemplateCache.has(fileName)) {
    return res.type('html').send(htmlTemplateCache.get(fileName));
  }
  const rawHtml = fs.readFileSync(path.join(PUBLIC_DIR, fileName), 'utf8');
  const processedHtml = injectAssetUrls(rawHtml);
  if (useCache) {
    htmlTemplateCache.set(fileName, processedHtml);
  }
  res.type('html').send(processedHtml);
}

async function getPageSession(req) {
  const token = readCookieValue(req.headers.cookie, 'session_token');
  if (!token) {
    return { token: null, status: 'missing', session: null };
  }

  const lookup = await db.getSessionByToken(token);
  return {
    token,
    status: lookup.status,
    session: lookup.session
  };
}

app.get(['/', '/index.html'], async (req, res, next) => {
  try {
    await initPromise;
    const pageSession = await getPageSession(req);
    if (pageSession.status !== 'ok' || !pageSession.session) {
      if (pageSession.token) {
        setSessionCookie(res, '', 0);
      }
      return res.redirect(302, '/login.html');
    }
    return sendHtmlPage(res, 'index.html', { protectedPage: true });
  } catch (err) {
    next(err);
  }
});

app.get('/admin.html', async (req, res, next) => {
  try {
    await initPromise;
    const pageSession = await getPageSession(req);
    if (pageSession.status !== 'ok' || !pageSession.session) {
      if (pageSession.token) {
        setSessionCookie(res, '', 0);
      }
      return res.redirect(302, '/login.html');
    }
    if (pageSession.session.role !== 'admin') {
      return res.redirect(302, '/index.html');
    }
    return sendHtmlPage(res, 'admin.html', { protectedPage: true });
  } catch (err) {
    next(err);
  }
});

app.get(['/login.html', '/register.html'], async (req, res, next) => {
  try {
    await initPromise;
    const pageSession = await getPageSession(req);
    if (pageSession.status === 'ok' && pageSession.session) {
      return res.redirect(302, '/index.html');
    }
    return sendHtmlPage(res, path.basename(req.path));
  } catch (err) {
    next(err);
  }
});

// Serve only the public directory
app.use(express.static(PUBLIC_DIR, {
  maxAge: 0,
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    if (filePath.includes(`${path.sep}dist${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return;
    }

    if (filePath.includes(`${path.sep}css${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return;
    }

    if (path.extname(filePath) === '.html') {
      res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate');
    }
  }
}));

app.use('/api', (req, res, next) => {
  if (
    SAFE_HTTP_METHODS.has(req.method) &&
    !/\/documents\/[^/]+\/download$/.test(req.path)
  ) {
    res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
    res.setHeader('Vary', 'Authorization, Cookie');
  } else {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
  }
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
  'text/plain'
]);

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
  if (!schema || typeof schema.safeParse !== 'function') {
    throw new Error('Invalid validation schema');
  }
  return schema.safeParse(data);
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
      password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH)
    });

    schemas.login = z.object({
      username: z.string().min(1).max(50),
      password: z.string().min(1).max(MAX_PASSWORD_LENGTH)
    });

    schemas.changePassword = z.object({
      currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
      newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH)
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
      parentTaskId: z.string().uuid().optional().nullable(),
      order: z.number().int().min(0).optional()
    });

    schemas.updateTask = z.object({
      title: z.string().min(1).max(500).optional(),
      completed: z.boolean().optional(),
      dueDate: dueDateSchema.optional(),
      notes: z.string().max(10000).optional(),
      priority: z.enum(VALID_PRIORITIES).optional(),
      recurring: z.string().max(100).optional().nullable(),
      blockedBy: z.string().max(100).optional().nullable(),
      parentTaskId: z.string().uuid().optional().nullable()
    });

    schemas.reorderItem = z.object({
      id: z.string().uuid(),
      order: z.number().int().min(0)
    });

    schemas.createTeam = z.object({
      name: z.string().min(1).max(100)
    });

    schemas.createWebhook = z.object({
      url: z.string().url().max(2048),
      events: z.array(z.enum(VALID_WEBHOOK_EVENTS)).min(1).max(20)
    });

    schemas.updateWebhook = z.object({
      url: z.string().url().max(2048).optional(),
      events: z.array(z.enum(VALID_WEBHOOK_EVENTS)).min(1).max(20).optional(),
      active: z.boolean().optional()
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
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
      || req.cookies?.session_token;
    const hasSessionCookie = Boolean(req.cookies?.session_token);
    const hasBearerToken = typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ');

    if (!token) {
      logSecurityEvent('auth.session.missing', {
        req,
        statusCode: 401,
        reason: 'missing_token'
      });
      return res.status(401).json({ error: 'Authentication required' });
    }

    const sessionLookup = await db.getSessionByToken(token);
    if (sessionLookup.status !== 'ok' || !sessionLookup.session) {
      if (!hasBearerToken && hasSessionCookie) {
        setSessionCookie(res, '', 0);
      }
      logSecurityEvent(`auth.session.${sessionLookup.status === 'not_found' ? 'invalid' : sessionLookup.status}`, {
        req,
        statusCode: 401,
        reason: sessionLookup.status,
        tokenFingerprint: fingerprintToken(token)
      });
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    if (!sessionLookup.session.approved) {
      logSecurityEvent('auth.session.pending_approval', {
        req,
        statusCode: 403,
        outcome: 'denied',
        actorUserId: sessionLookup.session.userId,
        actorUsername: sessionLookup.session.username
      });
      return res.status(403).json({ error: 'Account pending approval' });
    }

    req.user = sessionLookup.session;
    next();
  } catch (error) {
    logger.error({ err: error }, 'Authentication middleware error');
    logSecurityEvent('auth.session.middleware_error', {
      req,
      level: 'error',
      statusCode: 500,
      outcome: 'failure',
      severity: 'high'
    });
    res.status(500).json({ error: 'Authentication failed' });
  }
}

function getExpectedOrigin(req) {
  if (APP_ORIGIN) return APP_ORIGIN;
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || req.protocol || 'http')
    .split(',')[0]
    .trim();
  const forwardedHost = req.headers['x-forwarded-host'];
  const rawHost = forwardedHost || req.headers.host || '';
  const host = (Array.isArray(rawHost) ? rawHost[0] : rawHost)
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
  if (
    req.path === '/auth/login'
    || req.path === '/auth/register'
    || req.path === '/v1/auth/login'
    || req.path === '/v1/auth/register'
  ) {
    return next();
  }

  const authHeader = req.headers.authorization;
  const hasBearerAuth = typeof authHeader === 'string' && authHeader.startsWith('Bearer ');
  if (hasBearerAuth || !req.cookies?.session_token) {
    return next();
  }

  const secFetchSite = req.headers['sec-fetch-site'];
  if (secFetchSite && secFetchSite !== 'same-origin') {
    logSecurityEvent('request.same_origin_rejected', {
      req,
      statusCode: 403,
      reason: 'sec_fetch_site_mismatch'
    });
    return res.status(403).json({ error: 'Cross-site request rejected' });
  }

  if (secFetchSite === 'same-origin') {
    return next();
  }

  const sourceOrigin = parseHeaderOrigin(req.headers.origin) || parseHeaderOrigin(req.headers.referer);
  const expectedOrigin = getExpectedOrigin(req);
  if (!sourceOrigin || !expectedOrigin || sourceOrigin !== expectedOrigin) {
    logSecurityEvent('request.same_origin_rejected', {
      req,
      statusCode: 403,
      reason: 'origin_mismatch',
      expectedOrigin,
      sourceOrigin
    });
    return res.status(403).json({ error: 'Cross-site request rejected' });
  }

  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    logSecurityEvent('authz.admin_denied', {
      req,
      statusCode: 403,
      outcome: 'denied',
      severity: 'high'
    });
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function appendSetCookie(res, value) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', value);
    return;
  }
  const values = Array.isArray(existing) ? existing : [existing];
  res.setHeader('Set-Cookie', [...values, value]);
}

function setSessionCookie(res, token, maxAge = SESSION_ABSOLUTE_TIMEOUT_SECONDS) {
  const isProduction = process.env.NODE_ENV === 'production';
  const secureCookies = isProduction || APP_ORIGIN?.startsWith('https://');
  appendSetCookie(
    res,
    `session_token=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`
  );
}

function isMaintenanceBypassedPath(req) {
  const requestPath = req.path || req.originalUrl || '';
  return requestPath === '/api/health'
    || requestPath === '/api/v1/health'
    || requestPath === '/admin.html'
    || requestPath === '/api/admin'
    || requestPath.startsWith('/api/admin/')
    || requestPath === '/api/v1/admin'
    || requestPath.startsWith('/api/v1/admin/');
}

async function enforceMaintenanceMode(req, res) {
  const requestPath = req.path || req.originalUrl || '';
  if (isMaintenanceBypassedPath(req)) {
    return false;
  }

  const maintenanceMode = await db.getGlobalSetting('maintenanceMode');
  if (maintenanceMode !== true) {
    return false;
  }

  if (requestPath.startsWith('/api/')) {
    res.status(503).json({ error: 'Service unavailable for maintenance' });
  } else {
    res.status(503).type('text/plain').send('Service unavailable for maintenance');
  }
  return true;
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
      req.cookies[name.trim()] = rest.join('=');
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

app.use(async (req, res, next) => {
  try {
    if (await enforceMaintenanceMode(req, res)) {
      return;
    }
    next();
  } catch (err) {
    logger.error({ err }, 'Maintenance mode check failed');
    res.status(503).json({ error: 'Service unavailable' });
  }
});

const authRouter = createAuthRouter({
  db,
  logger,
  schemas,
  bcrypt,
  bcryptRounds: BCRYPT_ROUNDS,
  requireAuth,
  setSessionCookie,
  logSecurityEvent
});
const adminRouter = createAdminRouter({
  db,
  logger,
  requireAuth,
  requireAdmin,
  bcrypt,
  validRoles: VALID_ROLES,
  validGlobalSettingsKeys: VALID_GLOBAL_SETTINGS_KEYS,
  isSerializedJsonWithinLimit,
  logSecurityEvent
});
const projectsRouter = createProjectsRouter({ db, logger, schemas, requireAuth, eventBus });
const { projectTasksRouter, tasksRouter } = createTasksRouters({ db, logger, schemas, requireAuth, eventBus });
const { projectDocumentsRouter, documentsRouter } = createDocumentsRouters({
  db,
  logger,
  schemas,
  requireAuth,
  mammoth,
  allowedMimeTypes: ALLOWED_MIME_TYPES,
  logSecurityEvent,
  eventBus
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
const exportImportRouter = createExportImportRouter({ db, logger, schemas, requireAuth, logSecurityEvent });
const webhooksRouter = createWebhooksRouter({ db, logger, schemas, requireAuth });

// Initialize webhook dispatcher
const webhookDispatcher = createWebhookDispatcher({ db, logger, eventBus });
webhookDispatcher.init();

function mountApiRoutes(prefix) {
  app.use(`${prefix}/auth`, authRouter);
  app.use(`${prefix}/admin`, adminRouter);
  app.use(`${prefix}/projects/:projectId/tasks`, projectTasksRouter);
  app.use(`${prefix}/tasks`, tasksRouter);
  app.use(`${prefix}/projects/:projectId/documents`, projectDocumentsRouter);
  app.use(`${prefix}/documents`, documentsRouter);
  app.use(`${prefix}/projects`, projectsRouter);
  app.use(`${prefix}/teams`, teamsRouter);
  app.use(`${prefix}/settings`, settingsRouter);
  app.use(`${prefix}/notes`, notesRouter);
  app.use(`${prefix}/templates`, templatesRouter);
  app.use(`${prefix}/webhooks`, webhooksRouter);
  app.use(prefix, exportImportRouter);
}

for (const prefix of API_BASE_PATHS) {
  mountApiRoutes(prefix);
}

// ========== HEALTH CHECK ==========

app.get(['/api/health', '/api/v1/health'], async (req, res) => {
  const health = await db.healthCheck();
  res.status(health.status === 'ok' ? 200 : 503).json(health);
});

// ========== SERVE FRONTEND ==========

// SPA fallback — serve index.html for non-API routes
app.get('*', async (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    await initPromise;
    const pageSession = await getPageSession(req);
    if (pageSession.status !== 'ok' || !pageSession.session) {
      if (pageSession.token) {
        setSessionCookie(res, '', 0);
      }
      return res.redirect(302, '/login.html');
    }

    return sendHtmlPage(res, 'index.html', { protectedPage: true });
  } catch (err) {
    next(err);
  }
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

  const policyResult = validatePasswordPolicy({
    password: adminPass,
    username: adminUser,
    role: 'admin'
  });
  if (!policyResult.valid) {
    throw new Error(`ADMIN_PASS rejected by password policy: ${policyResult.message}`);
  }

  const passwordHash = await bcrypt.hash(adminPass, BCRYPT_ROUNDS);
  await db.createUser(adminUser, `${adminUser}@admin.local`, passwordHash, 'admin', true);
  logger.info({ username: adminUser }, 'Admin user created');
}

async function startServer() {
  logger.info('Waiting for database to initialize...');
  await initPromise;
  logger.info('Database ready');

  const server = app.listen(PORT, HOST, () => {
    logger.info({ host: HOST, port: PORT, database: 'projects.db', auth: 'session-based' }, 'Project Overviewer server running');
  });

  // Initialize WebSocket server (persistent Node.js only, not serverless)
  try {
    const createWebSocketServer = require('./ws-server');
    createWebSocketServer({ server, db, logger, eventBus, logSecurityEvent });
  } catch (err) {
    logger.warn({ err: err.message }, 'WebSocket server not available (ws module missing or error)');
  }

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
