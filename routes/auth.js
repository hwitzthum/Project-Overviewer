const express = require('express');
const {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  validatePasswordPolicy
} = require('../password-policy');

module.exports = function createAuthRouter({
  db,
  logger,
  schemas,
  bcrypt,
  bcryptRounds,
  requireAuth,
  setSessionCookie,
  logSecurityEvent
}) {
  const GENERIC_LOGIN_ERROR = 'Invalid username or password';
  const GENERIC_REGISTRATION_ERROR = 'Registration could not be completed.';
  const LOGIN_TRACK_WINDOW_MS = 15 * 60 * 1000;
  const LOGIN_DELAY_THRESHOLD = 3;
  const LOGIN_BLOCK_THRESHOLD = 8;
  const MAX_LOGIN_DELAY_MS = 1500;
  const LOGIN_TRACK_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
  const MAX_LOGIN_TRACKER_SIZE = 10000;
  const loginAttemptTracker = new Map();
  const dummyPasswordHash = bcrypt.hashSync('project-overviewer-dummy-password', bcryptRounds);

  function getClientIp(req) {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
      return forwardedFor.split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
  }

  function getThrottleKey(req, username) {
    return `${String(username || '').trim().toLowerCase()}|${getClientIp(req)}`;
  }

  function pruneLoginAttemptTracker(now = Date.now()) {
    for (const [key, value] of loginAttemptTracker.entries()) {
      if (!value?.lastFailureAt || now - value.lastFailureAt > LOGIN_TRACK_WINDOW_MS) {
        loginAttemptTracker.delete(key);
      }
    }

    if (loginAttemptTracker.size <= MAX_LOGIN_TRACKER_SIZE) {
      return;
    }

    const overflow = loginAttemptTracker.size - MAX_LOGIN_TRACKER_SIZE;
    const oldestKeys = [...loginAttemptTracker.entries()]
      .sort((left, right) => (left[1]?.lastFailureAt || 0) - (right[1]?.lastFailureAt || 0))
      .slice(0, overflow)
      .map(([key]) => key);

    for (const key of oldestKeys) {
      loginAttemptTracker.delete(key);
    }
  }

  const loginAttemptCleanupInterval = setInterval(() => {
    pruneLoginAttemptTracker();
  }, LOGIN_TRACK_CLEANUP_INTERVAL_MS);
  loginAttemptCleanupInterval.unref?.();

  function getLoginAttemptState(key) {
    const now = Date.now();
    pruneLoginAttemptTracker(now);
    const existing = loginAttemptTracker.get(key);
    if (!existing) return { failures: 0, blockedUntil: 0, lastFailureAt: 0 };

    if (now - existing.lastFailureAt > LOGIN_TRACK_WINDOW_MS) {
      loginAttemptTracker.delete(key);
      return { failures: 0, blockedUntil: 0, lastFailureAt: 0 };
    }

    return existing;
  }

  function recordLoginFailure(key) {
    const now = Date.now();
    const current = getLoginAttemptState(key);
    const failures = current.failures + 1;
    const delayExponent = Math.max(0, failures - LOGIN_DELAY_THRESHOLD);
    const blockedUntil = now + Math.min(MAX_LOGIN_DELAY_MS, 100 * (2 ** delayExponent));
    const nextState = { failures, blockedUntil, lastFailureAt: now };
    loginAttemptTracker.set(key, nextState);
    if (loginAttemptTracker.size > MAX_LOGIN_TRACKER_SIZE) {
      pruneLoginAttemptTracker(now);
    }
    return nextState;
  }

  function clearLoginFailures(key) {
    loginAttemptTracker.delete(key);
  }

  async function applyLoginDelay(req, username) {
    const key = getThrottleKey(req, username);
    const state = getLoginAttemptState(key);
    const now = Date.now();

    if (state.failures >= LOGIN_BLOCK_THRESHOLD && state.blockedUntil > now) {
      logSecurityEvent('auth.login.rate_limited', {
        req,
        statusCode: 429,
        outcome: 'denied',
        severity: 'medium',
        attemptedUsername: username,
        retryAfterMs: state.blockedUntil - now
      });
      return {
        blocked: true,
        key,
        retryAfterMs: state.blockedUntil - now
      };
    }

    if (state.blockedUntil > now) {
      await new Promise(resolve => setTimeout(resolve, state.blockedUntil - now));
    }

    return { blocked: false, key };
  }

  const router = express.Router();

  router.post('/register', async (req, res) => {
    try {
      const registrationEnabled = await db.getGlobalSetting('registrationEnabled');
      if (registrationEnabled === false) {
        return res.status(403).json({ error: 'Registration is currently disabled' });
      }

      if (schemas.register) {
        const result = schemas.register.safeParse(req.body);
        if (!result.success) {
          logSecurityEvent('auth.register.invalid_input', {
            req,
            statusCode: 400,
            reason: 'schema_validation_failed'
          });
          return res.status(400).json({ error: 'Invalid input', details: result.error.issues });
        }
      }

      const { username, email, password } = req.body;
      const passwordPolicy = validatePasswordPolicy({ password, username, email, role: 'user' });
      if (!passwordPolicy.valid) {
        logSecurityEvent('auth.register.rejected', {
          req,
          statusCode: 400,
          reason: passwordPolicy.reason,
          attemptedUsername: username
        });
        return res.status(400).json({ error: passwordPolicy.message });
      }

      const existingUser = await db.getUserByUsername(username);
      if (existingUser) {
        logSecurityEvent('auth.register.rejected', {
          req,
          statusCode: 409,
          reason: 'duplicate_username',
          attemptedUsername: username
        });
        return res.status(409).json({ error: GENERIC_REGISTRATION_ERROR });
      }

      const existingEmail = await db.getUserByEmail(email);
      if (existingEmail) {
        logSecurityEvent('auth.register.rejected', {
          req,
          statusCode: 409,
          reason: 'duplicate_email',
          attemptedUsername: username
        });
        return res.status(409).json({ error: GENERIC_REGISTRATION_ERROR });
      }

      const passwordHash = await bcrypt.hash(password, bcryptRounds);
      const user = await db.createUser(username, email, passwordHash, 'user', false);

      res.status(201).json({
        message: 'Registration successful. Your account is pending admin approval.',
        user: { id: user.id, username: user.username, email: user.email }
      });
      logSecurityEvent('auth.register.success', {
        req,
        level: 'info',
        outcome: 'success',
        severity: 'low',
        statusCode: 201,
        actorUserId: user.id,
        actorUsername: user.username
      });
    } catch (error) {
      logger.error({ err: error }, 'Registration error');
      logSecurityEvent('auth.register.error', {
        req,
        level: 'error',
        outcome: 'failure',
        severity: 'high',
        statusCode: 500
      });
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  router.post('/login', async (req, res) => {
    try {
      if (schemas.login) {
        const result = schemas.login.safeParse(req.body);
        if (!result.success) {
          logSecurityEvent('auth.login.invalid_input', {
            req,
            statusCode: 400,
            reason: 'schema_validation_failed'
          });
          return res.status(400).json({ error: 'Invalid input' });
        }
      }

      const { username, password } = req.body;
      const throttle = await applyLoginDelay(req, username);
      if (throttle.blocked) {
        res.setHeader('Retry-After', Math.max(1, Math.ceil(throttle.retryAfterMs / 1000)));
        return res.status(429).json({ error: 'Too many authentication attempts, please try again later' });
      }

      const user = await db.getUserByUsername(username);
      if (!user) {
        await bcrypt.compare(password, dummyPasswordHash);
        recordLoginFailure(throttle.key);
        logSecurityEvent('auth.login.failed', {
          req,
          statusCode: 401,
          reason: 'unknown_user',
          attemptedUsername: username
        });
        return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
      }

      const passwordMatch = await bcrypt.compare(password, user.password_hash);
      if (!passwordMatch) {
        recordLoginFailure(throttle.key);
        logSecurityEvent('auth.login.failed', {
          req,
          statusCode: 401,
          reason: 'invalid_password',
          attemptedUsername: username,
          actorUserId: user.id,
          actorUsername: user.username
        });
        return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
      }

      if (!user.approved) {
        recordLoginFailure(throttle.key);
        logSecurityEvent('auth.login.denied', {
          req,
          statusCode: 401,
          outcome: 'denied',
          reason: 'pending_approval',
          actorUserId: user.id,
          actorUsername: user.username
        });
        return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
      }

      clearLoginFailures(throttle.key);
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
      logSecurityEvent('auth.login.success', {
        req,
        level: 'info',
        outcome: 'success',
        severity: 'low',
        statusCode: 200,
        actorUserId: user.id,
        actorUsername: user.username
      });
    } catch (error) {
      logger.error({ err: error }, 'Login error');
      logSecurityEvent('auth.login.error', {
        req,
        level: 'error',
        outcome: 'failure',
        severity: 'high',
        statusCode: 500
      });
      res.status(500).json({ error: 'Login failed' });
    }
  });

  router.post('/logout', requireAuth, async (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '')
        || req.cookies?.session_token;
      await db.deleteSession(token);

      setSessionCookie(res, '', 0);
      logSecurityEvent('auth.logout.success', {
        req,
        level: 'info',
        outcome: 'success',
        severity: 'low',
        statusCode: 200
      });
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, 'Logout error');
      logSecurityEvent('auth.logout.error', {
        req,
        level: 'error',
        outcome: 'failure',
        severity: 'medium',
        statusCode: 500
      });
      res.status(500).json({ error: 'Logout failed' });
    }
  });

  router.get('/me', requireAuth, async (req, res) => {
    try {
      const theme = await db.getUserSetting(req.user.userId, 'theme');
      res.json({
        id: req.user.userId,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role,
        theme: theme || 'auto'
      });
    } catch (error) {
      logger.error({ err: error }, 'Get current user error');
      res.status(500).json({ error: 'Failed to get user info' });
    }
  });

  router.put('/password', requireAuth, async (req, res) => {
    try {
      if (schemas.changePassword) {
        const result = schemas.changePassword.safeParse(req.body);
        if (!result.success) {
          const message = result.error.issues[0]?.message || 'Invalid password change request';
          return res.status(400).json({ error: message, details: result.error.issues });
        }
      }

      const { currentPassword, newPassword } = req.body;
      const user = await db.getUserById(req.user.userId);
      const passwordMatch = await bcrypt.compare(currentPassword, user.password_hash);
      if (!passwordMatch) {
        logSecurityEvent('auth.password_change.failed', {
          req,
          statusCode: 401,
          reason: 'incorrect_current_password'
        });
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      const passwordPolicy = validatePasswordPolicy({
        password: newPassword,
        username: user.username,
        email: user.email,
        role: user.role
      });
      if (!passwordPolicy.valid) {
        logSecurityEvent('auth.password_change.failed', {
          req,
          statusCode: 400,
          reason: passwordPolicy.reason
        });
        return res.status(400).json({ error: passwordPolicy.message });
      }

      const passwordHash = await bcrypt.hash(newPassword, bcryptRounds);
      await db.updateUser(req.user.userId, { passwordHash });
      await db.deleteUserSessions(req.user.userId);
      const session = await db.createSession(req.user.userId);

      setSessionCookie(res, session.token);
      logSecurityEvent('auth.password_change.success', {
        req,
        level: 'info',
        outcome: 'success',
        severity: 'medium',
        statusCode: 200
      });
      res.json({ success: true, token: session.token });
    } catch (error) {
      logger.error({ err: error }, 'Password change error');
      logSecurityEvent('auth.password_change.error', {
        req,
        level: 'error',
        outcome: 'failure',
        severity: 'high',
        statusCode: 500
      });
      res.status(500).json({ error: 'Password change failed' });
    }
  });

  return router;
};
