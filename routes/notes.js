const express = require('express');

module.exports = function createNotesRouter({ db, logger, schemas, requireAuth }) {
  const router = express.Router();

  router.get('/', requireAuth, async (req, res) => {
    try {
      const content = await db.getQuickNotes(req.user.userId);
      res.json({ content });
    } catch (error) {
      logger.error({ err: error }, 'Error fetching notes');
      res.status(500).json({ error: 'Failed to fetch notes' });
    }
  });

  router.post('/', requireAuth, async (req, res) => {
    try {
      if (schemas.notes) {
        const result = schemas.notes.safeParse(req.body);
        if (!result.success) {
          return res.status(400).json({ error: 'Invalid input', details: result.error.issues });
        }
      }
      await db.saveQuickNotes(req.user.userId, req.body.content);
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, 'Error saving notes');
      res.status(500).json({ error: 'Failed to save notes' });
    }
  });

  return router;
};
