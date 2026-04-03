const express = require('express');

module.exports = function createProjectsRouter({ db, logger, schemas, requireAuth, eventBus }) {
  async function resolveTeamScope(userId) {
    const workspaceMode = await db.getUserSetting(userId, 'workspaceMode');
    let teamUserIds = null;
    if (workspaceMode === 'team' || workspaceMode === null) {
      teamUserIds = await db.getTeamUserIds(userId);
    }
    return teamUserIds;
  }

  const router = express.Router();

  router.get('/', requireAuth, async (req, res) => {
    try {
      const teamUserIds = await resolveTeamScope(req.user.userId);
      const projects = await db.getAllProjects(req.user.userId, { teamUserIds });
      res.json(projects);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching projects');
      res.status(500).json({ error: 'Failed to fetch projects' });
    }
  });

  router.get('/:id', requireAuth, async (req, res) => {
    try {
      const teamUserIds = await resolveTeamScope(req.user.userId);
      const project = await db.getProjectById(req.params.id, req.user.userId, { teamUserIds });
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      res.json(project);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching project');
      res.status(500).json({ error: 'Failed to fetch project' });
    }
  });

  router.post('/', requireAuth, async (req, res) => {
    try {
      if (schemas.createProject) {
        const result = schemas.createProject.safeParse(req.body);
        if (!result.success) {
          return res.status(400).json({ error: 'Invalid input', details: result.error.issues });
        }
      }

      const maxProjectsPerUser = await db.getGlobalSetting('maxProjectsPerUser');
      if (Number.isInteger(maxProjectsPerUser) && maxProjectsPerUser >= 0) {
        const projectCount = await db.countProjectsByUser(req.user.userId);
        if (projectCount >= maxProjectsPerUser) {
          return res.status(403).json({ error: 'Project limit reached' });
        }
      }

      const project = await db.createProject(req.user.userId, req.body);
      res.status(201).json(project);
      if (eventBus) eventBus.emit('project.created', { projectId: project.id, userId: req.user.userId, title: req.body.title });
    } catch (error) {
      logger.error({ err: error }, 'Error creating project');
      res.status(500).json({ error: 'Failed to create project' });
    }
  });

  router.put('/:id', requireAuth, async (req, res) => {
    try {
      if (schemas.updateProject) {
        const result = schemas.updateProject.safeParse(req.body);
        if (!result.success) {
          return res.status(400).json({ error: 'Invalid input', details: result.error.issues });
        }
      }

      const project = await db.updateProject(req.params.id, req.user.userId, req.body);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      res.json(project);
      if (eventBus) eventBus.emit('project.updated', { projectId: req.params.id, userId: req.user.userId, changes: req.body });
    } catch (error) {
      logger.error({ err: error }, 'Error updating project');
      res.status(500).json({ error: 'Failed to update project' });
    }
  });

  router.delete('/:id', requireAuth, async (req, res) => {
    try {
      const deleted = await db.deleteProject(req.params.id, req.user.userId);
      if (!deleted) {
        return res.status(404).json({ error: 'Project not found' });
      }
      res.json({ success: true });
      if (eventBus) eventBus.emit('project.deleted', { projectId: req.params.id, userId: req.user.userId });
    } catch (error) {
      logger.error({ err: error }, 'Error deleting project');
      res.status(500).json({ error: 'Failed to delete project' });
    }
  });

  router.post('/reorder', requireAuth, async (req, res) => {
    try {
      if (schemas.reorderItem && Array.isArray(req.body)) {
        for (const item of req.body) {
          const result = schemas.reorderItem.safeParse(item);
          if (!result.success) {
            return res.status(400).json({ error: 'Invalid reorder data' });
          }
        }
        if (req.body.length > 1000) {
          return res.status(400).json({ error: 'Too many items to reorder' });
        }
      }

      await db.reorderProjects(req.user.userId, req.body);
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, 'Error reordering projects');
      res.status(500).json({ error: 'Failed to reorder projects' });
    }
  });

  return router;
};
