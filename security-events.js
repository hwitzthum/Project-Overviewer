const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const SECURITY_LOG_PATH = process.env.SECURITY_LOG_PATH || '';
const securityLogger = logger.child({ logCategory: 'security' });

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== ''));
}

function getClientIp(req) {
  const forwardedFor = req?.headers?.['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }
  return req?.ip || req?.socket?.remoteAddress || undefined;
}

function getAuthType(req) {
  const authHeader = req?.headers?.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) return 'bearer';
  if (req?.cookies?.session_token) return 'cookie';
  return 'none';
}

function fingerprintToken(token) {
  if (!token) return undefined;
  return crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 12);
}

function writeSecurityLog(entry, level) {
  const logMethod = typeof securityLogger[level] === 'function' ? level : 'warn';
  securityLogger[logMethod](entry, 'security_event');

  if (!SECURITY_LOG_PATH) return;

  fs.mkdirSync(path.dirname(SECURITY_LOG_PATH), { recursive: true });
  fs.appendFileSync(SECURITY_LOG_PATH, `${JSON.stringify({ time: new Date().toISOString(), ...entry })}\n`, 'utf8');
}

function logSecurityEvent(eventType, options = {}) {
  const {
    req,
    level = 'warn',
    outcome = 'failure',
    severity = 'medium',
    ...details
  } = options;

  const entry = compact({
    logType: 'security',
    eventType,
    outcome,
    severity,
    method: req?.method,
    path: req?.originalUrl || req?.url || req?.path,
    ip: getClientIp(req),
    origin: req?.headers?.origin,
    referer: req?.headers?.referer,
    userAgent: req?.headers?.['user-agent'],
    authType: getAuthType(req),
    actorUserId: req?.user?.userId,
    actorUsername: req?.user?.username,
    actorRole: req?.user?.role,
    sessionId: req?.user?.sessionId,
    ...details
  });

  writeSecurityLog(entry, level);
}

module.exports = {
  SECURITY_LOG_PATH,
  fingerprintToken,
  logSecurityEvent
};
