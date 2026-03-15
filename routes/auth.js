const express = require('express');

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
  const router = express.Router();

  router.post('/register', async (req, res) => {
    try {
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
      const existingUser = await db.getUserByUsername(username);
      if (existingUser) {
        logSecurityEvent('auth.register.rejected', {
          req,
          statusCode: 409,
          reason: 'duplicate_username',
          attemptedUsername: username
        });
        return res.status(409).json({ error: 'Username already taken' });
      }

      const existingEmail = await db.getUserByEmail(email);
      if (existingEmail) {
        logSecurityEvent('auth.register.rejected', {
          req,
          statusCode: 409,
          reason: 'duplicate_email',
          attemptedUsername: username
        });
        return res.status(409).json({ error: 'Email already registered' });
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
      const user = await db.getUserByUsername(username);
      if (!user) {
        logSecurityEvent('auth.login.failed', {
          req,
          statusCode: 401,
          reason: 'unknown_user',
          attemptedUsername: username
        });
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      const passwordMatch = await bcrypt.compare(password, user.password_hash);
      if (!passwordMatch) {
        logSecurityEvent('auth.login.failed', {
          req,
          statusCode: 401,
          reason: 'invalid_password',
          attemptedUsername: username,
          actorUserId: user.id,
          actorUsername: user.username
        });
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      if (!user.approved) {
        logSecurityEvent('auth.login.denied', {
          req,
          statusCode: 403,
          outcome: 'denied',
          reason: 'pending_approval',
          actorUserId: user.id,
          actorUsername: user.username
        });
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

  router.get('/me', requireAuth, (req, res) => {
    res.json({
      id: req.user.userId,
      username: req.user.username,
      email: req.user.email,
      role: req.user.role
    });
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
