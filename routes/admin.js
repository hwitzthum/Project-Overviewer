const express = require('express');

module.exports = function createAdminRouter({
  db,
  logger,
  requireAuth,
  requireAdmin,
  validRoles,
  validGlobalSettingsKeys,
  isSerializedJsonWithinLimit
}) {
  const router = express.Router();

  router.get('/users', requireAuth, requireAdmin, async (req, res) => {
    try {
      const users = await db.getAllUsers();
      res.json(users);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching users');
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  router.put('/users/:id/approve', requireAuth, requireAdmin, async (req, res) => {
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

  router.put('/users/:id/role', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { role } = req.body;
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

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

  router.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
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

  router.get('/settings', requireAuth, requireAdmin, async (req, res) => {
    try {
      const settings = await db.getAllGlobalSettings();
      res.json(settings);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching global settings');
      res.status(500).json({ error: 'Failed to fetch global settings' });
    }
  });

  router.post('/settings/:key', requireAuth, requireAdmin, async (req, res) => {
    try {
      if (!validGlobalSettingsKeys.includes(req.params.key)) {
        return res.status(400).json({ error: 'Invalid global settings key' });
      }
      if (!isSerializedJsonWithinLimit(req.body?.value, 16 * 1024)) {
        return res.status(400).json({ error: 'Setting value is too large' });
      }
      await db.setGlobalSetting(req.params.key, req.body.value);
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, 'Error saving global setting');
      res.status(500).json({ error: 'Failed to save global setting' });
    }
  });

  return router;
};
