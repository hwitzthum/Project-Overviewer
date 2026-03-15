const express = require('express');
const { inspectDocumentPayload } = require('../document-security');

module.exports = function createExportImportRouter({ db, logger, schemas, requireAuth, logSecurityEvent }) {
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

      const normalizedImport = JSON.parse(JSON.stringify(req.body));

      for (const project of normalizedImport.projects || []) {
        for (const document of project.documents || []) {
          if (document?.type !== 'docx') continue;
          const inspection = inspectDocumentPayload(document, { allowMimeInference: true });
          if (!inspection.valid) {
            logSecurityEvent('document.import.rejected', {
              req,
              statusCode: 400,
              reason: inspection.reason,
              severity: 'medium'
            });
            return res.status(400).json({ error: 'Import contains an invalid document payload' });
          }
          document.mimeType = inspection.safeMimeType;
        }
      }

      if (schemas.importData) {
        const result = schemas.importData.safeParse(normalizedImport);
        if (!result.success) {
          return res.status(400).json({ error: 'Invalid import data', details: result.error.issues });
        }
        await db.importData(req.user.userId, result.data);
      } else {
        await db.importData(req.user.userId, normalizedImport);
      }
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, 'Error importing data');
      res.status(500).json({ error: 'Failed to import data' });
    }
  });

  return router;
};
