const express = require('express');

module.exports = function createExportImportRouter({ db, logger, schemas, requireAuth }) {
  const router = express.Router();

  router.get('/export', requireAuth, async (req, res) => {
    try {
      const data = await db.exportData(req.user.userId);
      res.json(data);
    } catch (error) {
      logger.error({ err: error }, 'Error exporting data');
      res.status(500).json({ error: 'Failed to export data' });
    }
  });

  router.post('/import', requireAuth, async (req, res) => {
    try {
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ error: 'Invalid import data' });
      }
      if (schemas.importData) {
        const result = schemas.importData.safeParse(req.body);
        if (!result.success) {
          return res.status(400).json({ error: 'Invalid import data', details: result.error.issues });
        }
        await db.importData(req.user.userId, result.data);
      } else {
        await db.importData(req.user.userId, req.body);
      }
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, 'Error importing data');
      res.status(500).json({ error: 'Failed to import data' });
    }
  });

  return router;
};
