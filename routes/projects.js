const express = require("express");
const { resolveTeamScope } = require("./shared");
const { PROJECT_TRASH_RETENTION_MS } = require("../app-constants");

module.exports = function createProjectsRouter({
  db,
  logger,
  schemas,
  requireAuth,
  eventBus,
}) {
  const router = express.Router();

  const TRASH_RETENTION_DAYS = Math.round(
    PROJECT_TRASH_RETENTION_MS / (24 * 60 * 60 * 1000),
  );

  // Best-effort retention sweep. There is no cron on serverless, so the trash is
  // swept opportunistically on deletes and once at start-up; a missed sweep just
  // runs on the next delete. Never awaited — a slow or failing sweep must not
  // make the user's delete hang or fail.
  function sweepExpiredTrash() {
    db.purgeExpiredProjects()
      .then((removed) => {
        if (removed > 0) {
          logger.info({ removed }, "Purged expired projects from trash");
        }
      })
      .catch((err) =>
        logger.warn({ err }, "Trash retention sweep failed; will retry"),
      );
  }

  router.get("/", requireAuth, async (req, res) => {
    try {
      const teamUserIds = await resolveTeamScope(
        db,
        req.user.userId,
        req.user.workspaceMode,
        req.user.teamId,
      );
      const projects = await db.getAllProjects(req.user.userId, {
        teamUserIds,
      });
      res.json(projects);
    } catch (error) {
      logger.error({ err: error }, "Error fetching projects");
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  // Registered before "/:id" so the literal path is not captured as an id.
  router.get("/deleted", requireAuth, async (req, res) => {
    try {
      const projects = await db.getDeletedProjects(req.user.userId);
      res.json({ projects, retentionDays: TRASH_RETENTION_DAYS });
    } catch (error) {
      logger.error({ err: error }, "Error fetching deleted projects");
      res.status(500).json({ error: "Failed to fetch deleted projects" });
    }
  });

  router.get("/:id", requireAuth, async (req, res) => {
    try {
      const teamUserIds = await resolveTeamScope(
        db,
        req.user.userId,
        req.user.workspaceMode,
        req.user.teamId,
      );
      const project = await db.getProjectById(req.params.id, req.user.userId, {
        teamUserIds,
      });
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      logger.error({ err: error }, "Error fetching project");
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  router.post("/", requireAuth, async (req, res) => {
    try {
      if (schemas.createProject) {
        const result = schemas.createProject.safeParse(req.body);
        if (!result.success) {
          return res
            .status(400)
            .json({ error: "Invalid input", details: result.error.issues });
        }
      }

      const maxProjectsPerUser =
        await db.getGlobalSetting("maxProjectsPerUser");
      if (Number.isInteger(maxProjectsPerUser) && maxProjectsPerUser >= 0) {
        const projectCount = await db.countProjectsByUser(req.user.userId);
        if (projectCount >= maxProjectsPerUser) {
          return res.status(403).json({ error: "Project limit reached" });
        }
      }

      const project = await db.createProject(
        req.user.userId,
        req.body,
        req.user.username,
      );
      res.status(201).json(project);
      if (eventBus)
        eventBus.emit("project.created", {
          projectId: project.id,
          userId: req.user.userId,
          title: req.body.title,
        });
    } catch (error) {
      logger.error({ err: error }, "Error creating project");
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  router.put("/:id", requireAuth, async (req, res) => {
    try {
      if (schemas.updateProject) {
        const result = schemas.updateProject.safeParse(req.body);
        if (!result.success) {
          return res
            .status(400)
            .json({ error: "Invalid input", details: result.error.issues });
        }
      }

      const project = await db.updateProject(
        req.params.id,
        req.user.userId,
        req.body,
      );
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
      if (eventBus)
        eventBus.emit("project.updated", {
          projectId: req.params.id,
          userId: req.user.userId,
          changes: req.body,
        });
    } catch (error) {
      logger.error({ err: error }, "Error updating project");
      res.status(500).json({ error: "Failed to update project" });
    }
  });

  // Soft delete: the project moves to the trash and stays restorable for
  // TRASH_RETENTION_DAYS. Permanent removal is a separate, explicit call.
  router.delete("/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await db.softDeleteProject(
        req.params.id,
        req.user.userId,
      );
      if (!deleted) {
        return res.status(404).json({ error: "Project not found" });
      }
      sweepExpiredTrash();
      res.json({ success: true, restorable: true });
      if (eventBus)
        eventBus.emit("project.deleted", {
          projectId: req.params.id,
          userId: req.user.userId,
        });
    } catch (error) {
      logger.error({ err: error }, "Error deleting project");
      res.status(500).json({ error: "Failed to delete project" });
    }
  });

  router.post("/:id/restore", requireAuth, async (req, res) => {
    try {
      // A project deleted while at the quota must not let the user exceed it by
      // creating replacements first and then restoring — countProjectsByUser
      // excludes trashed rows, so the slot really was released.
      const maxProjectsPerUser =
        await db.getGlobalSetting("maxProjectsPerUser");
      if (Number.isInteger(maxProjectsPerUser) && maxProjectsPerUser >= 0) {
        const projectCount = await db.countProjectsByUser(req.user.userId);
        if (projectCount >= maxProjectsPerUser) {
          return res.status(403).json({
            error:
              "Project limit reached — free a slot before restoring this project",
          });
        }
      }

      const restored = await db.restoreProject(req.params.id, req.user.userId);
      if (!restored) {
        return res
          .status(404)
          .json({ error: "No restorable project with that id" });
      }

      const project = await db.getProjectById(req.params.id, req.user.userId);
      res.json(project);
      if (eventBus)
        eventBus.emit("project.updated", {
          projectId: req.params.id,
          userId: req.user.userId,
          changes: { restored: true },
        });
    } catch (error) {
      logger.error({ err: error }, "Error restoring project");
      res.status(500).json({ error: "Failed to restore project" });
    }
  });

  // Permanent. Only succeeds on a project already in the trash, so destroying
  // data always takes two deliberate steps.
  router.delete("/:id/purge", requireAuth, async (req, res) => {
    try {
      const purged = await db.purgeProject(req.params.id, req.user.userId);
      if (!purged) {
        return res
          .status(404)
          .json({ error: "No trashed project with that id" });
      }
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error purging project");
      res.status(500).json({ error: "Failed to permanently delete project" });
    }
  });

  router.post("/reorder", requireAuth, async (req, res) => {
    try {
      if (schemas.reorderItem && Array.isArray(req.body)) {
        for (const item of req.body) {
          const result = schemas.reorderItem.safeParse(item);
          if (!result.success) {
            return res.status(400).json({ error: "Invalid reorder data" });
          }
        }
        if (req.body.length > 1000) {
          return res.status(400).json({ error: "Too many items to reorder" });
        }
      }

      await db.reorderProjects(req.user.userId, req.body);
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error reordering projects");
      res.status(500).json({ error: "Failed to reorder projects" });
    }
  });

  return router;
};
