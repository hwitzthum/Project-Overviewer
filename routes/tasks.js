const express = require('express');

module.exports = function createTasksRouters({ db, logger, schemas, requireAuth }) {
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

      const taskId = await db.createTask(req.params.projectId, req.user.userId, req.body);
      if (taskId === null) {
        return res.status(404).json({ error: 'Project not found' });
      }
      res.status(201).json({ id: taskId });
    } catch (error) {
      logger.error({ err: error }, 'Error creating task');
      res.status(500).json({ error: 'Failed to create task' });
    }
  });

  projectTasksRouter.post('/reorder', requireAuth, async (req, res) => {
    try {
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
    } catch (error) {
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
    } catch (error) {
      logger.error({ err: error }, 'Error deleting task');
      res.status(500).json({ error: 'Failed to delete task' });
    }
  });

  return { projectTasksRouter, tasksRouter };
};
