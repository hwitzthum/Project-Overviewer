const express = require('express');
const JSZip = require('jszip');
const { inspectDocumentPayload } = require('../document-security');
const { resolveTeamScope } = require('./shared');

// docx previewing decompresses the uploaded zip via mammoth/jszip. A crafted
// docx can pass the (compressed, ~10MB-capped) upload signature check yet
// declare an enormous uncompressed size or entry count, exhausting memory
// when mammoth extracts it. Both figures are read straight from the zip's
// central directory during the (cheap, non-inflating) metadata parse, so this
// check runs before any decompression happens.
const MAX_DOCX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_DOCX_ZIP_ENTRIES = 5000;

async function assertSafeDocxForPreview(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files);
  if (entries.length > MAX_DOCX_ZIP_ENTRIES) {
    throw new Error('docx_too_many_entries');
  }
  let totalUncompressed = 0;
  for (const entry of entries) {
    totalUncompressed += entry._data?.uncompressedSize || 0;
    if (totalUncompressed > MAX_DOCX_UNCOMPRESSED_BYTES) {
      throw new Error('docx_uncompressed_too_large');
    }
  }
}

module.exports = function createDocumentsRouters({
  db,
  logger,
  schemas,
  requireAuth,
  mammoth,
  allowedMimeTypes,
  logSecurityEvent,
  eventBus
}) {

  function getSafeDocumentMimeType(mimeType) {
    return allowedMimeTypes.has(mimeType) ? mimeType : 'application/octet-stream';
  }

  function getSafeDocumentFileName(document) {
    const fallback = document.mimeType === 'application/pdf' ? 'document.pdf' : 'document.docx';
    const rawName = document.fileName || fallback;
    return rawName.replace(/[^\w.\-]/g, '_').replace(/\.\./g, '_').substring(0, 200);
  }

  const projectDocumentsRouter = express.Router({ mergeParams: true });
  const documentsRouter = express.Router();

  projectDocumentsRouter.get('/', requireAuth, async (req, res) => {
    try {
      const teamUserIds = await resolveTeamScope(db, req.user.userId, req.user.workspaceMode, req.user.teamId);
      const documents = await db.getProjectDocuments(req.params.projectId, req.user.userId, {
        includeContent: false,
        teamUserIds
      });
      if (documents === null) {
        return res.status(404).json({ error: 'Project not found' });
      }
      res.json(documents);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching documents');
      res.status(500).json({ error: 'Failed to fetch documents' });
    }
  });

  projectDocumentsRouter.post('/', requireAuth, async (req, res) => {
    try {
      if (schemas.createDocument) {
        const result = schemas.createDocument.safeParse(req.body);
        if (!result.success) {
          return res.status(400).json({ error: 'Invalid input', details: result.error.issues });
        }
      }
      if (req.body?.type === 'docx') {
        const inspection = inspectDocumentPayload(req.body);
        if (!inspection.valid) {
          logSecurityEvent('document.upload.rejected', {
            req,
            statusCode: 400,
            reason: inspection.reason,
            severity: 'medium'
          });
          return res.status(400).json({ error: 'Uploaded file content does not match the declared file type' });
        }
      }
      const documentId = await db.createDocument(req.params.projectId, req.user.userId, req.body);
      if (documentId === null) {
        return res.status(404).json({ error: 'Project not found' });
      }
      res.status(201).json({ id: documentId });
      if (eventBus) eventBus.emit('document.created', { documentId, projectId: req.params.projectId, userId: req.user.userId });
    } catch (error) {
      if (error?.code === 'DOCUMENT_LIMIT_EXCEEDED') {
        return res.status(403).json({ error: error.message });
      }
      logger.error({ err: error }, 'Error creating document');
      res.status(500).json({ error: 'Failed to create document' });
    }
  });

  documentsRouter.delete('/:id', requireAuth, async (req, res) => {
    try {
      const deleted = await db.deleteDocument(req.params.id, req.user.userId);
      if (!deleted) {
        return res.status(404).json({ error: 'Document not found' });
      }
      res.json({ success: true });
      if (eventBus) eventBus.emit('document.deleted', { documentId: req.params.id, userId: req.user.userId });
    } catch (error) {
      logger.error({ err: error }, 'Error deleting document');
      res.status(500).json({ error: 'Failed to delete document' });
    }
  });

  documentsRouter.get('/:id/preview', requireAuth, async (req, res) => {
    try {
      const teamUserIds = await resolveTeamScope(db, req.user.userId, req.user.workspaceMode, req.user.teamId);
      const document = await db.getDocumentById(req.params.id, req.user.userId, { teamUserIds });
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      if (document.type === 'email') {
        return res.json({
          id: document.id,
          type: 'email',
          previewType: 'email',
          title: document.title || 'Email',
          email: document.email || {}
        });
      }

      if (document.type !== 'docx' || !document.contentBase64) {
        return res.status(400).json({ error: 'Document preview is unavailable' });
      }

      const inspection = inspectDocumentPayload(document, { allowMimeInference: true });
      if (!inspection.valid) {
        logSecurityEvent('document.preview.rejected', {
          req,
          statusCode: 400,
          reason: inspection.reason,
          severity: 'medium'
        });
        return res.status(400).json({ error: 'Document preview is unavailable' });
      }

      const buffer = inspection.buffer;
      const mimeType = getSafeDocumentMimeType(inspection.safeMimeType);
      const fileName = getSafeDocumentFileName(document);
      const downloadUrl = `${req.baseUrl}/${document.id}/download`;

      if (mimeType === 'application/pdf') {
        return res.json({
          id: document.id,
          type: 'docx',
          previewType: 'pdf',
          title: document.title || fileName,
          fileName,
          mimeType,
          inlineUrl: `${downloadUrl}?disposition=inline`,
          downloadUrl
        });
      }

      if (mimeType === 'text/plain') {
        return res.json({
          id: document.id,
          type: 'docx',
          previewType: 'text',
          title: document.title || fileName,
          fileName,
          mimeType,
          text: buffer.toString('utf8')
        });
      }

      if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' && mammoth) {
        try {
          await assertSafeDocxForPreview(buffer);
        } catch (sizeError) {
          logSecurityEvent('document.preview.rejected', {
            req,
            statusCode: 400,
            reason: sizeError.message === 'docx_too_many_entries' || sizeError.message === 'docx_uncompressed_too_large'
              ? sizeError.message
              : 'docx_zip_parse_failed',
            severity: 'medium'
          });
          return res.status(400).json({ error: 'Document preview is unavailable' });
        }
        const result = await mammoth.extractRawText({ buffer });
        return res.json({
          id: document.id,
          type: 'docx',
          previewType: 'text',
          title: document.title || fileName,
          fileName,
          mimeType,
          text: result.value?.trim() || 'No readable text found in this document.'
        });
      }

      return res.json({
        id: document.id,
        type: 'docx',
        previewType: 'download',
        title: document.title || fileName,
        fileName,
        mimeType,
        downloadUrl,
        message: 'Preview is not available for this file type. Use download instead.'
      });
    } catch (error) {
      logger.error({ err: error }, 'Error previewing document');
      res.status(500).json({ error: 'Failed to preview document' });
    }
  });

  documentsRouter.get('/:id/download', requireAuth, async (req, res) => {
    try {
      const teamUserIds = await resolveTeamScope(db, req.user.userId, req.user.workspaceMode, req.user.teamId);
      const document = await db.getDocumentById(req.params.id, req.user.userId, { teamUserIds });
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }
      if (document.type !== 'docx' || !document.contentBase64) {
        return res.status(400).json({ error: 'Document is not downloadable' });
      }

      const inspection = inspectDocumentPayload(document, { allowMimeInference: true });
      if (!inspection.valid) {
        logSecurityEvent('document.download.rejected', {
          req,
          statusCode: 400,
          reason: inspection.reason,
          severity: 'medium'
        });
        return res.status(400).json({ error: 'Document is not downloadable' });
      }

      const buffer = inspection.buffer;
      const safeFileName = getSafeDocumentFileName(document);
      const encodedFileName = encodeURIComponent(safeFileName);
      const mimeType = getSafeDocumentMimeType(inspection.safeMimeType);
      const disposition = req.query.disposition === 'inline' ? 'inline' : 'attachment';

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `${disposition}; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`);
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (disposition === 'inline') {
        res.setHeader('Content-Security-Policy', 'sandbox');
      }
      res.send(buffer);
    } catch (error) {
      logger.error({ err: error }, 'Error downloading document');
      res.status(500).json({ error: 'Failed to download document' });
    }
  });

  return { projectDocumentsRouter, documentsRouter };
};
