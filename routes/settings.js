const express = require('express');

module.exports = function createSettingsRouter({
  db,
  logger,
  requireAuth,
  validSettingsKeys,
  isSerializedJsonWithinLimit
}) {
  const router = express.Router();

  router.get('/', requireAuth, async (req, res) => {
    try {
      const settings = await db.getAllUserSettings(req.user.userId);
      res.json(settings);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching settings');
      res.status(500).json({ error: 'Failed to fetch settings' });
    }
  });

  router.get('/:key', requireAuth, async (req, res) => {
    try {
      if (!validSettingsKeys.includes(req.params.key)) {
        return res.status(400).json({ error: 'Invalid settings key' });
      }
      const value = await db.getUserSetting(req.user.userId, req.params.key);
      res.json({ value });
    } catch (error) {
      logger.error({ err: error }, 'Error fetching setting');
      res.status(500).json({ error: 'Failed to fetch setting' });
    }
  });

  router.post('/:key', requireAuth, async (req, res) => {
    try {
      if (!validSettingsKeys.includes(req.params.key)) {
        return res.status(400).json({ error: 'Invalid settings key' });
      }
      if (!isSerializedJsonWithinLimit(req.body?.value, 16 * 1024)) {
        return res.status(400).json({ error: 'Setting value is too large' });
      }
      await db.setUserSetting(req.user.userId, req.params.key, req.body.value);
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, 'Error saving setting');
      res.status(500).json({ error: 'Failed to save setting' });
    }
  });

  return router;
};
