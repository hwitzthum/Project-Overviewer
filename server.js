const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.static(__dirname));

// ========== PROJECT ENDPOINTS ==========

// Get all projects
app.get('/api/projects', async (req, res) => {
  try {
    const projects = await db.getAllProjects();
    res.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Get single project
app.get('/api/projects/:id', async (req, res) => {
  try {
    const includeDocumentContent = req.query.includeDocumentContent === '1';
    const project = await db.getProjectById(req.params.id, { includeDocumentContent });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// Create project
app.post('/api/projects', async (req, res) => {
  try {
    const project = await db.createProject(req.body);
    res.status(201).json(project);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Update project
app.put('/api/projects/:id', async (req, res) => {
  try {
    const project = await db.updateProject(req.params.id, req.body);
    res.json(project);
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// Delete project
app.delete('/api/projects/:id', async (req, res) => {
  try {
    const deleted = await db.deleteProject(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Reorder projects
app.post('/api/projects/reorder', async (req, res) => {
  try {
    await db.reorderProjects(req.body);
    res.json({ success: true });
  } catch (error) {
    console.error('Error reordering projects:', error);
    res.status(500).json({ error: 'Failed to reorder projects' });
  }
});

// ========== TASK ENDPOINTS ==========

// Get tasks for a project
app.get('/api/projects/:projectId/tasks', async (req, res) => {
  try {
    const tasks = await db.getProjectTasks(req.params.projectId);
    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Create task
app.post('/api/projects/:projectId/tasks', async (req, res) => {
  try {
    const taskId = await db.createTask(req.params.projectId, req.body);
    res.status(201).json({ id: taskId });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update task
app.put('/api/tasks/:id', async (req, res) => {
  try {
    await db.updateTask(req.params.id, req.body);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Delete task
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const deleted = await db.deleteTask(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Reorder tasks within a project
app.post('/api/projects/:projectId/tasks/reorder', async (req, res) => {
  try {
    await db.reorderTasks(req.params.projectId, req.body);
    res.json({ success: true });
  } catch (error) {
    console.error('Error reordering tasks:', error);
    res.status(500).json({ error: 'Failed to reorder tasks' });
  }
});

// ========== DOCUMENT ENDPOINTS ==========

// Get documents for a project
app.get('/api/projects/:projectId/documents', async (req, res) => {
  try {
    const documents = await db.getProjectDocuments(req.params.projectId, { includeContent: false });
    res.json(documents);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// Create a document for a project
app.post('/api/projects/:projectId/documents', async (req, res) => {
  try {
    const documentId = await db.createDocument(req.params.projectId, req.body);
    res.status(201).json({ id: documentId });
  } catch (error) {
    console.error('Error creating document:', error);
    res.status(500).json({ error: 'Failed to create document' });
  }
});

// Delete a document
app.delete('/api/documents/:id', async (req, res) => {
  try {
    const deleted = await db.deleteDocument(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Download a document file
app.get('/api/documents/:id/download', async (req, res) => {
  try {
    const document = await db.getDocumentById(req.params.id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    if (document.type !== 'docx' || !document.contentBase64) {
      return res.status(400).json({ error: 'Document is not downloadable' });
    }

    const buffer = Buffer.from(document.contentBase64, 'base64');
    const fileName = document.fileName || 'document.docx';
    const safeFileName = fileName.replace(/"/g, '');
    const mimeType = document.mimeType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({ error: 'Failed to download document' });
  }
});

// ========== SETTINGS ENDPOINTS ==========

// Get all settings
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await db.getAllSettings();
    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Get single setting
app.get('/api/settings/:key', async (req, res) => {
  try {
    const value = await db.getSetting(req.params.key);
    res.json({ value });
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

// Set setting
app.post('/api/settings/:key', async (req, res) => {
  try {
    await db.setSetting(req.params.key, req.body.value);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving setting:', error);
    res.status(500).json({ error: 'Failed to save setting' });
  }
});

// ========== QUICK NOTES ENDPOINTS ==========

// Get quick notes
app.get('/api/notes', async (req, res) => {
  try {
    const content = await db.getQuickNotes();
    res.json({ content });
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

// Save quick notes
app.post('/api/notes', async (req, res) => {
  try {
    await db.saveQuickNotes(req.body.content);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving notes:', error);
    res.status(500).json({ error: 'Failed to save notes' });
  }
});

// ========== TEMPLATES ENDPOINTS ==========

// Get all templates
app.get('/api/templates', async (req, res) => {
  try {
    const templates = await db.getAllTemplates();
    res.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// ========== EXPORT/IMPORT ENDPOINTS ==========

// Export all data
app.get('/api/export', async (req, res) => {
  try {
    const data = await db.exportData();
    res.json(data);
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// Import data
app.post('/api/import', async (req, res) => {
  try {
    await db.importData(req.body);
    res.json({ success: true });
  } catch (error) {
    console.error('Error importing data:', error);
    res.status(500).json({ error: 'Failed to import data' });
  }
});

// ========== SERVE FRONTEND ==========

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ========== START SERVER ==========

async function startServer() {
  // Wait for database to be ready
  console.log('Waiting for database to initialize...');
  await db.waitForDb();
  console.log('Database ready!');

  app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║   Project Overviewer Server Running   ║
╠════════════════════════════════════════╣
║                                        ║
║   URL: http://localhost:${PORT}         ║
║                                        ║
║   Database: projects.db (SQLite)      ║
║                                        ║
║   Press Ctrl+C to stop the server     ║
║                                        ║
╚════════════════════════════════════════╝
    `);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\nShutting down gracefully...');
  await db.closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\nShutting down gracefully...');
  await db.closeDatabase();
  process.exit(0);
});
