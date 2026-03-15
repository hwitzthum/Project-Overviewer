const express = require('express');

module.exports = function createTemplatesRouter({ db, logger, requireAuth }) {
  const router = express.Router();

  router.get('/', requireAuth, async (req, res) => {
    try {
      const templates = await db.getAllTemplates();
      res.json(templates);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching templates');
      res.status(500).json({ error: 'Failed to fetch templates' });
    }
  });

  return router;
};
