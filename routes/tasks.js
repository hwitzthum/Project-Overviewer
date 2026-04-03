const express = require('express');

module.exports = function createTasksRouters({ db, logger, schemas, requireAuth, eventBus }) {
  const projectTasksRouter = express.Router({ mergeParams: true });
  const tasksRouter = express.Router();

  projectTasksRouter.get('/', requireAuth, async (req, res) => {
    try {
      const tasks = await db.getProjectTasks(req.params.projectId, req.user.userId);
      if (tasks === null) {
        return res.status(404).json({ error: 'Project not found' });
      }
      res.json(tasks);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching tasks');
      res.status(500).json({ error: 'Failed to fetch tasks' });
    }
  });

  projectTasksRouter.post('/', requireAuth, async (req, res) => {
    try {
      if (schemas.createTask) {
        const result = schemas.createTask.safeParse(req.body);
        if (!result.success) {
          return res.status(400).json({ error: 'Invalid input', details: result.error.issues });
        }
      }

      const maxTasksPerProject = await db.getGlobalSetting('maxTasksPerProject');
      if (Number.isInteger(maxTasksPerProject) && maxTasksPerProject >= 0) {
        const taskCount = await db.countTasksByProject(req.params.projectId, req.user.userId);
        if (taskCount === null) {
          return res.status(404).json({ error: 'Project not found' });
        }
        if (taskCount >= maxTasksPerProject) {
          return res.status(403).json({ error: 'Task limit reached' });
        }
      }

      const taskId = await db.createTask(req.params.projectId, req.user.userId, req.body);
      if (taskId === null) {
        return res.status(404).json({ error: 'Project not found' });
      }
      res.status(201).json({ id: taskId });
      if (eventBus) eventBus.emit('task.created', { taskId, projectId: req.params.projectId, userId: req.user.userId, title: req.body.title });
    } catch (error) {
      if (error.message && error.message.includes('Cannot nest subtasks')) {
        return res.status(400).json({ error: error.message });
      }
      logger.error({ err: error }, 'Error creating task');
      res.status(500).json({ error: 'Failed to create task' });
    }
  });

  projectTasksRouter.post('/reorder', requireAuth, async (req, res) => {
    try {
      if (Array.isArray(req.body) && req.body.length > 1000) {
        return res.status(400).json({ error: 'Too many items to reorder' });
      }
      if (schemas.reorderItem && Array.isArray(req.body)) {
        for (const item of req.body) {
          const result = schemas.reorderItem.safeParse(item);
          if (!result.success) {
            return res.status(400).json({ error: 'Invalid reorder data' });
          }
        }
      }

      const success = await db.reorderTasks(req.params.projectId, req.user.userId, req.body);
      if (!success) {
        return res.status(404).json({ error: 'Project not found' });
      }
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, 'Error reordering tasks');
      res.status(500).json({ error: 'Failed to reorder tasks' });
    }
  });

  tasksRouter.put('/:id', requireAuth, async (req, res) => {
    try {
      if (schemas.updateTask) {
        const result = schemas.updateTask.safeParse(req.body);
        if (!result.success) {
          return res.status(400).json({ error: 'Invalid input', details: result.error.issues });
        }
      }

      const updated = await db.updateTask(req.params.id, req.user.userId, req.body);
      if (!updated) {
        return res.status(404).json({ error: 'Task not found' });
      }
      res.json({ success: true });
      if (eventBus) eventBus.emit('task.updated', { taskId: req.params.id, userId: req.user.userId, changes: req.body });
    } catch (error) {
      if (error.message && error.message.includes('Cannot nest subtasks')) {
        return res.status(400).json({ error: error.message });
      }
      logger.error({ err: error }, 'Error updating task');
      res.status(500).json({ error: 'Failed to update task' });
    }
  });

  tasksRouter.delete('/:id', requireAuth, async (req, res) => {
    try {
      const deleted = await db.deleteTask(req.params.id, req.user.userId);
      if (!deleted) {
        return res.status(404).json({ error: 'Task not found' });
      }
      res.json({ success: true });
      if (eventBus) eventBus.emit('task.deleted', { taskId: req.params.id, userId: req.user.userId });
    } catch (error) {
      logger.error({ err: error }, 'Error deleting task');
      res.status(500).json({ error: 'Failed to delete task' });
    }
  });

  return { projectTasksRouter, tasksRouter };
};
