const express = require('express');

module.exports = function createTasksRouters({ db, logger, schemas, requireAuth, eventBus }) {
  const projectTasksRouter = express.Router({ mergeParams: true });
  const tasksRouter = express.Router();

  async function checkTaskLimit(projectId, userId, addingCount = 1) {
    const max = await db.getGlobalSetting('maxTasksPerProject');
    if (!Number.isInteger(max) || max < 0) return null;
    const count = await db.countTasksByProject(projectId, userId);
    if (count === null) return 'not_found';
    if (count + addingCount > max) return 'exceeded';
    return null;
  }

  function flattenTaskTree(tasks) {
    const flattened = [];

    function visit(taskList) {
      for (const task of taskList || []) {
        flattened.push(task);
        if (task.subtasks && task.subtasks.length > 0) {
          visit(task.subtasks);
        }
      }
    }

    visit(tasks);
    return flattened;
  }

  function countIncomingRootTasks(tasks) {
    return tasks.reduce((count, task) => count + (!task.parentTaskId && !task.parentTempId ? 1 : 0), 0);
  }

  function validateBulkTaskGraph(tasks, existingTaskMap) {
    const tempIdMap = new Map();

    for (let index = 0; index < tasks.length; index += 1) {
      const task = tasks[index];
      if (!task.tempId) continue;
      if (tempIdMap.has(task.tempId)) {
        return `Duplicate tempId "${task.tempId}" at item ${index}`;
      }
      tempIdMap.set(task.tempId, task);
    }

    for (let index = 0; index < tasks.length; index += 1) {
      const task = tasks[index];

      if (task.parentTaskId && task.parentTempId) {
        return `Task at index ${index} cannot specify both parentTaskId and parentTempId`;
      }
      if (task.blockedBy && task.blockedByTempId) {
        return `Task at index ${index} cannot specify both blockedBy and blockedByTempId`;
      }
      if (task.tempId && task.parentTempId && task.tempId === task.parentTempId) {
        return `Task at index ${index} cannot be its own parent`;
      }
      if (task.tempId && task.blockedByTempId && task.tempId === task.blockedByTempId) {
        return `Task at index ${index} cannot depend on itself`;
      }

      if (task.parentTaskId) {
        const parent = existingTaskMap.get(task.parentTaskId);
        if (!parent) {
          return `Task at index ${index} references an unknown parent task`;
        }
        if (parent.parentTaskId) {
          return 'Cannot nest subtasks more than one level';
        }
      }

      if (task.parentTempId) {
        const parent = tempIdMap.get(task.parentTempId);
        if (!parent) {
          return `Task at index ${index} references an unknown parent tempId`;
        }
        if (parent.parentTaskId || parent.parentTempId) {
          return 'Cannot nest subtasks more than one level';
        }
      }

      if (task.blockedByTempId && !tempIdMap.has(task.blockedByTempId)) {
        return `Task at index ${index} references an unknown blockedByTempId`;
      }
    }

    return null;
  }

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

      const limitResult = await checkTaskLimit(
        req.params.projectId,
        req.user.userId,
        req.body.parentTaskId ? 0 : 1
      );
      if (limitResult === 'not_found') return res.status(404).json({ error: 'Project not found' });
      if (limitResult === 'exceeded') return res.status(403).json({ error: 'Task limit reached' });

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

  projectTasksRouter.post('/bulk', requireAuth, async (req, res) => {
    try {
      if (!Array.isArray(req.body)) {
        return res.status(400).json({ error: 'Expected an array of tasks' });
      }
      if (req.body.length > 500) {
        return res.status(400).json({ error: 'Too many tasks (max 500)' });
      }

      if (schemas.createTaskBulk) {
        const result = schemas.createTaskBulk.safeParse(req.body);
        if (!result.success) {
          return res.status(400).json({ error: 'Invalid input', details: result.error.issues });
        }
      }

      const existingTasks = await db.getProjectTasks(req.params.projectId, req.user.userId);
      if (existingTasks === null) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const existingTaskMap = new Map(flattenTaskTree(existingTasks).map(task => [task.id, task]));
      const graphError = validateBulkTaskGraph(req.body, existingTaskMap);
      if (graphError) {
        return res.status(400).json({ error: graphError });
      }

      const limitResult = await checkTaskLimit(
        req.params.projectId,
        req.user.userId,
        countIncomingRootTasks(req.body)
      );
      if (limitResult === 'not_found') return res.status(404).json({ error: 'Project not found' });
      if (limitResult === 'exceeded') return res.status(403).json({ error: 'Task limit would be exceeded' });

      const idMap = await db.createTasksBulk(req.params.projectId, req.user.userId, req.body);
      if (idMap === null) {
        return res.status(404).json({ error: 'Project not found' });
      }
      res.status(201).json({ idMap });
      if (eventBus) eventBus.emit('task.bulk_created', { projectId: req.params.projectId, userId: req.user.userId, count: req.body.length });
    } catch (error) {
      logger.error({ err: error }, 'Error bulk creating tasks');
      res.status(500).json({ error: 'Failed to create tasks' });
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
