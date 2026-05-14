const express = require("express");

module.exports = function createAdminRouter({
  db,
  logger,
  schemas,
  requireAuth,
  requireAdmin,
  bcrypt,
  bcryptRounds,
  validRoles,
  validGlobalSettingsKeys,
  isSerializedJsonWithinLimit,
  validatePasswordPolicy,
  logSecurityEvent,
}) {
  const STEPUP_TRACK_WINDOW_MS = 15 * 60 * 1000;
  const STEPUP_DELAY_THRESHOLD = 2;
  const STEPUP_BLOCK_THRESHOLD = 5;
  const MAX_STEPUP_DELAY_MS = 3000;
  const stepUpAttemptTracker = new Map();

  function getStepUpKey(req) {
    return `${req.user.userId}|${req.ip || "unknown"}`;
  }

  function getStepUpState(key) {
    const now = Date.now();
    const existing = stepUpAttemptTracker.get(key);
    if (!existing || now - existing.lastFailureAt > STEPUP_TRACK_WINDOW_MS) {
      stepUpAttemptTracker.delete(key);
      return { failures: 0, blockedUntil: 0, lastFailureAt: 0 };
    }
    return existing;
  }

  function recordStepUpFailure(key) {
    const now = Date.now();
    const current = getStepUpState(key);
    const failures = current.failures + 1;
    const delayExponent = Math.max(0, failures - STEPUP_DELAY_THRESHOLD);
    const blockedUntil =
      now + Math.min(MAX_STEPUP_DELAY_MS, 200 * 2 ** delayExponent);
    stepUpAttemptTracker.set(key, {
      failures,
      blockedUntil,
      lastFailureAt: now,
    });
  }

  function clearStepUpFailures(key) {
    stepUpAttemptTracker.delete(key);
  }

  async function requireAdminStepUp(req, res) {
    const key = getStepUpKey(req);
    const state = getStepUpState(key);
    const now = Date.now();

    if (state.failures >= STEPUP_BLOCK_THRESHOLD && state.blockedUntil > now) {
      logSecurityEvent("admin.reauth.blocked", {
        req,
        statusCode: 429,
        reason: "too_many_stepup_failures",
        outcome: "denied",
        severity: "high",
        retryAfterMs: state.blockedUntil - now,
      });
      res.setHeader(
        "Retry-After",
        Math.max(1, Math.ceil((state.blockedUntil - now) / 1000)),
      );
      res.status(429).json({
        error:
          "Too many failed reauthentication attempts, please try again later",
      });
      return false;
    }

    if (state.blockedUntil > now) {
      await new Promise((resolve) =>
        setTimeout(resolve, state.blockedUntil - now),
      );
    }

    const adminPassword = String(req.body?.adminPassword || "");
    if (!adminPassword) {
      recordStepUpFailure(key);
      logSecurityEvent("admin.reauth.failed", {
        req,
        statusCode: 401,
        reason: "missing_admin_password",
        outcome: "denied",
        severity: "high",
      });
      res
        .status(401)
        .json({ error: "Administrator reauthentication required" });
      return false;
    }

    const adminUser = await db.getUserById(req.user.userId);
    const passwordMatch = adminUser
      ? await bcrypt.compare(adminPassword, adminUser.password_hash)
      : false;
    if (!passwordMatch) {
      recordStepUpFailure(key);
      logSecurityEvent("admin.reauth.failed", {
        req,
        statusCode: 401,
        reason: "invalid_admin_password",
        outcome: "denied",
        severity: "high",
      });
      res
        .status(401)
        .json({ error: "Administrator reauthentication required" });
      return false;
    }

    clearStepUpFailures(key);
    return true;
  }

  const router = express.Router();

  router.get("/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const users = await db.getAllUsers();
      res.json(users);
    } catch (error) {
      logger.error({ err: error }, "Error fetching users");
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  router.put(
    "/users/:id/approve",
    requireAuth,
    requireAdmin,
    async (req, res) => {
      try {
        if (!(await requireAdminStepUp(req, res))) return;
        const user = await db.getUserById(req.params.id);
        if (!user) {
          logSecurityEvent("admin.user_approve.failed", {
            req,
            statusCode: 404,
            reason: "user_not_found",
            targetUserId: req.params.id,
          });
          return res.status(404).json({ error: "User not found" });
        }
        await db.updateUser(req.params.id, { approved: true });
        await db.deleteUserSessions(req.params.id);
        logSecurityEvent("admin.user_approve.success", {
          req,
          level: "info",
          outcome: "success",
          severity: "medium",
          statusCode: 200,
          targetUserId: req.params.id,
          targetUsername: user.username,
        });
        res.json({ success: true });
      } catch (error) {
        logger.error({ err: error }, "Error approving user");
        res.status(500).json({ error: "Failed to approve user" });
      }
    },
  );

  router.put("/users/:id/role", requireAuth, requireAdmin, async (req, res) => {
    try {
      if (!(await requireAdminStepUp(req, res))) return;
      const { role } = req.body;
      if (!validRoles.includes(role)) {
        logSecurityEvent("admin.role_change.failed", {
          req,
          statusCode: 400,
          reason: "invalid_role",
          targetUserId: req.params.id,
          targetRole: role,
        });
        return res.status(400).json({ error: "Invalid role" });
      }

      if (req.params.id === req.user.userId && role !== "admin") {
        logSecurityEvent("admin.role_change.denied", {
          req,
          statusCode: 400,
          outcome: "denied",
          reason: "self_demotion_blocked",
          targetUserId: req.params.id,
          targetRole: role,
        });
        return res.status(400).json({ error: "Cannot change your own role" });
      }

      const user = await db.getUserById(req.params.id);
      if (!user) {
        logSecurityEvent("admin.role_change.failed", {
          req,
          statusCode: 404,
          reason: "user_not_found",
          targetUserId: req.params.id,
          targetRole: role,
        });
        return res.status(404).json({ error: "User not found" });
      }
      await db.updateUser(req.params.id, { role });
      await db.deleteUserSessions(req.params.id);
      logSecurityEvent("admin.role_change.success", {
        req,
        level: "info",
        outcome: "success",
        severity: "high",
        statusCode: 200,
        targetUserId: req.params.id,
        targetUsername: user.username,
        targetRole: role,
      });
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error changing role");
      res.status(500).json({ error: "Failed to change role" });
    }
  });

  router.delete("/users/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      if (!(await requireAdminStepUp(req, res))) return;
      if (req.params.id === req.user.userId) {
        logSecurityEvent("admin.user_delete.denied", {
          req,
          statusCode: 400,
          outcome: "denied",
          reason: "self_delete_blocked",
          targetUserId: req.params.id,
        });
        return res
          .status(400)
          .json({ error: "Cannot delete your own account" });
      }

      const deleted = await db.deleteUser(req.params.id);
      if (!deleted) {
        logSecurityEvent("admin.user_delete.failed", {
          req,
          statusCode: 404,
          reason: "user_not_found",
          targetUserId: req.params.id,
        });
        return res.status(404).json({ error: "User not found" });
      }
      logSecurityEvent("admin.user_delete.success", {
        req,
        level: "info",
        outcome: "success",
        severity: "high",
        statusCode: 200,
        targetUserId: req.params.id,
      });
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error deleting user");
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  router.put(
    "/users/:id/password",
    requireAuth,
    requireAdmin,
    async (req, res) => {
      try {
        if (req.params.id === req.user.userId) {
          logSecurityEvent("admin.password_reset.denied", {
            req,
            statusCode: 400,
            outcome: "denied",
            reason: "self_reset_blocked",
            targetUserId: req.params.id,
          });
          return res.status(400).json({
            error: "Use Settings → Change Password to update your own password",
          });
        }

        if (schemas && schemas.adminResetPassword) {
          const result = schemas.adminResetPassword.safeParse(req.body);
          if (!result.success) {
            const message =
              result.error.issues[0]?.message ||
              "Invalid password reset request";
            return res
              .status(400)
              .json({ error: message, details: result.error.issues });
          }
        }

        if (!(await requireAdminStepUp(req, res))) return;

        const targetUser = await db.getUserById(req.params.id);
        if (!targetUser) {
          logSecurityEvent("admin.password_reset.failed", {
            req,
            statusCode: 404,
            reason: "user_not_found",
            targetUserId: req.params.id,
          });
          return res.status(404).json({ error: "User not found" });
        }

        const { newPassword } = req.body;
        const policy = validatePasswordPolicy({
          password: newPassword,
          username: targetUser.username,
          email: targetUser.email,
          role: targetUser.role,
        });
        if (!policy.valid) {
          logSecurityEvent("admin.password_reset.failed", {
            req,
            statusCode: 400,
            reason: policy.reason,
            targetUserId: req.params.id,
            targetUsername: targetUser.username,
          });
          return res.status(400).json({ error: policy.message });
        }

        const passwordHash = await bcrypt.hash(newPassword, bcryptRounds);
        await db.updateUser(req.params.id, { passwordHash });
        await db.deleteUserSessions(req.params.id);

        logSecurityEvent("admin.password_reset.success", {
          req,
          level: "info",
          outcome: "success",
          severity: "high",
          statusCode: 200,
          targetUserId: req.params.id,
          targetUsername: targetUser.username,
        });
        res.json({ success: true });
      } catch (error) {
        logger.error({ err: error }, "Error resetting user password");
        logSecurityEvent("admin.password_reset.error", {
          req,
          level: "error",
          outcome: "failure",
          severity: "high",
          statusCode: 500,
          targetUserId: req.params.id,
        });
        res.status(500).json({ error: "Failed to reset password" });
      }
    },
  );

  router.get("/settings", requireAuth, requireAdmin, async (req, res) => {
    try {
      const settings = await db.getAllGlobalSettings();
      res.json(settings);
    } catch (error) {
      logger.error({ err: error }, "Error fetching global settings");
      res.status(500).json({ error: "Failed to fetch global settings" });
    }
  });

  router.post("/settings/:key", requireAuth, requireAdmin, async (req, res) => {
    try {
      if (!validGlobalSettingsKeys.includes(req.params.key)) {
        logSecurityEvent("admin.settings_update.failed", {
          req,
          statusCode: 400,
          reason: "invalid_setting_key",
          settingKey: req.params.key,
        });
        return res.status(400).json({ error: "Invalid global settings key" });
      }
      if (!isSerializedJsonWithinLimit(req.body?.value, 16 * 1024)) {
        logSecurityEvent("admin.settings_update.failed", {
          req,
          statusCode: 400,
          reason: "oversized_setting_value",
          settingKey: req.params.key,
        });
        return res.status(400).json({ error: "Setting value is too large" });
      }
      await db.setGlobalSetting(req.params.key, req.body.value);
      logSecurityEvent("admin.settings_update.success", {
        req,
        level: "info",
        outcome: "success",
        severity: "medium",
        statusCode: 200,
        settingKey: req.params.key,
      });
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error saving global setting");
      res.status(500).json({ error: "Failed to save global setting" });
    }
  });

  return router;
};
