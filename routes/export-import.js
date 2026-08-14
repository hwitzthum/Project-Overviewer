const express = require('express');
const { inspectDocumentPayload } = require('../document-security');

// Same per-value cap enforced by the direct settings endpoints
// (routes/settings.js: POST /settings/:key and PUT /settings). Imported
// settings must be held to the same limit — otherwise a user can smuggle
// an oversized value (up to the 10MB import body cap) into user_settings
// via /api/import even though every other write path rejects it.
const MAX_SETTING_VALUE_BYTES = 16 * 1024;

module.exports = function createExportImportRouter({ db, logger, schemas, requireAuth, logSecurityEvent, isSerializedJsonWithinLimit }) {
  const router = express.Router();

  router.get('/export', requireAuth, async (req, res) => {
    try {
      const data = await db.exportData(req.user.userId);
      logSecurityEvent('data.export.success', {
        req,
        level: 'info',
        outcome: 'success',
        severity: 'medium',
        statusCode: 200,
        projectCount: data?.projects?.length ?? 0
      });
      res.json(data);
    } catch (error) {
      logger.error({ err: error }, 'Error exporting data');
      res.status(500).json({ error: 'Failed to export data' });
    }
  });

  router.post('/import', requireAuth, async (req, res) => {
    try {
      if (!req.body || typeof req.body !== 'object') {
        logSecurityEvent('data.import.rejected', {
          req,
          statusCode: 400,
          reason: 'invalid_body',
          severity: 'medium'
        });
        return res.status(400).json({ error: 'Invalid import data' });
      }

      if (schemas.importData) {
        // Validate schema first so array-size and field-length limits are
        // enforced before any document inspection (which decodes base64 and
        // does MIME inference — expensive operations we must not run on
        // unbounded attacker-controlled input).
        const result = schemas.importData.safeParse(req.body);
        if (!result.success) {
          logSecurityEvent('data.import.rejected', {
            req,
            statusCode: 400,
            reason: 'schema_validation_failed',
            severity: 'medium'
          });
          return res.status(400).json({ error: 'Invalid import data', details: result.error.issues });
        }

        for (const project of result.data.projects || []) {
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

        // db.importData() already allowlists which settings keys get written,
        // but it applies no size limit — unlike every other settings write
        // path (POST /settings/:key, PUT /settings), which caps each value
        // at MAX_SETTING_VALUE_BYTES. Enforce the same cap here so import
        // cannot be used to store an oversized value under a legitimate key.
        if (result.data.settings && typeof isSerializedJsonWithinLimit === 'function') {
          for (const [key, value] of Object.entries(result.data.settings)) {
            if (!isSerializedJsonWithinLimit(value, MAX_SETTING_VALUE_BYTES)) {
              logSecurityEvent('data.import.rejected', {
                req,
                statusCode: 400,
                reason: 'oversized_setting_value',
                settingKey: key,
                severity: 'medium'
              });
              return res.status(400).json({ error: `Imported setting value is too large: ${key}` });
            }
          }
        }

        const maxProjects = await db.getGlobalSetting('maxProjectsPerUser');
        if (maxProjects !== null && maxProjects !== undefined) {
          const importCount = (result.data.projects || []).length;
          if (importCount > maxProjects) {
            return res.status(403).json({
              error: `Import would exceed the project limit (${maxProjects} projects per user).`
            });
          }
        }

        await db.importData(req.user.userId, result.data);
        logSecurityEvent('data.import.success', {
          req,
          level: 'info',
          outcome: 'success',
          severity: 'medium',
          statusCode: 200,
          projectCount: result.data?.projects?.length ?? 0
        });
      } else {
        // schemas.importData is undefined — Zod failed to initialise.  Fail
        // closed: processing unvalidated import data could allow oversized
        // payloads, malformed documents, or prototype-pollution vectors to
        // reach db.importData.  Reject until the server restarts healthy.
        logger.error('Import schema unavailable; rejecting request');
        return res.status(500).json({ error: 'Server configuration error' });
      }
      res.json({ success: true });
    } catch (error) {
      if (error?.code === 'DOCUMENT_LIMIT_EXCEEDED') {
        return res.status(403).json({ error: error.message });
      }
      logger.error({ err: error }, 'Error importing data');
      res.status(500).json({ error: 'Failed to import data' });
    }
  });

  return router;
};
