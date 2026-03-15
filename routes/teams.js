const express = require('express');

module.exports = function createTeamsRouter({ db, logger, schemas, requireAuth }) {
  const router = express.Router();

  router.post('/', requireAuth, async (req, res) => {
    try {
      if (schemas.createTeam) {
        const result = schemas.createTeam.safeParse(req.body);
        if (!result.success) {
          return res.status(400).json({ error: 'Invalid input', details: result.error.issues });
        }
      }

      const { name } = req.body;
      const team = await db.createTeam(name, req.user.userId);
      res.status(201).json(team);
    } catch (error) {
      if (error.message && error.message.includes('already belongs to a team')) {
        return res.status(409).json({ error: error.message });
      }
      logger.error({ err: error }, 'Error creating team');
      res.status(500).json({ error: 'Failed to create team' });
    }
  });

  router.get('/mine', requireAuth, async (req, res) => {
    try {
      const team = await db.getTeamByUserId(req.user.userId);
      if (!team) {
        return res.json({ team: null });
      }
      res.json(team);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching team');
      res.status(500).json({ error: 'Failed to fetch team' });
    }
  });

  router.post('/:id/members', requireAuth, async (req, res) => {
    try {
      const teamId = req.params.id;
      const team = await db.getTeamByUserId(req.user.userId);
      if (!team || team.id !== teamId) {
        return res.status(403).json({ error: 'Not a member of this team' });
      }
      if (team.myRole !== 'owner' && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only team owner or admin can add members' });
      }

      if (schemas.addTeamMember) {
        const result = schemas.addTeamMember.safeParse(req.body);
        if (!result.success) {
          return res.status(400).json({ error: 'Invalid input', details: result.error.issues });
        }
      }

      const { username } = req.body;
      const user = await db.getUserByUsername(username);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (!user.approved) {
        return res.status(400).json({ error: 'User account is not approved' });
      }

      await db.addTeamMember(teamId, user.id);
      res.json({ success: true });
    } catch (error) {
      if (error.message && error.message.includes('already belongs to a team')) {
        return res.status(409).json({ error: error.message });
      }
      logger.error({ err: error }, 'Error adding team member');
      res.status(500).json({ error: 'Failed to add team member' });
    }
  });

  router.delete('/:id/members/:userId', requireAuth, async (req, res) => {
    try {
      const teamId = req.params.id;
      const targetUserId = req.params.userId;
      const team = await db.getTeamByUserId(req.user.userId);
      if (!team || team.id !== teamId) {
        return res.status(403).json({ error: 'Not a member of this team' });
      }

      const isSelf = targetUserId === req.user.userId;
      if (!isSelf && team.myRole !== 'owner' && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only team owner or admin can remove members' });
      }

      if (team.createdBy === targetUserId) {
        return res.status(400).json({ error: 'Cannot remove team owner. Delete the team instead.' });
      }

      const removed = await db.removeTeamMember(teamId, targetUserId);
      if (!removed) {
        return res.status(404).json({ error: 'Member not found in team' });
      }
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, 'Error removing team member');
      res.status(500).json({ error: 'Failed to remove team member' });
    }
  });

  router.post('/:id/leave', requireAuth, async (req, res) => {
    try {
      const teamId = req.params.id;
      const team = await db.getTeamByUserId(req.user.userId);
      if (!team || team.id !== teamId) {
        return res.status(403).json({ error: 'Not a member of this team' });
      }

      if (team.createdBy === req.user.userId) {
        return res.status(400).json({ error: 'Team owner cannot leave. Delete the team or transfer ownership first.' });
      }

      await db.removeTeamMember(teamId, req.user.userId);
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, 'Error leaving team');
      res.status(500).json({ error: 'Failed to leave team' });
    }
  });

  router.delete('/:id', requireAuth, async (req, res) => {
    try {
      const teamId = req.params.id;
      const team = await db.getTeamByUserId(req.user.userId);
      if (!team || team.id !== teamId) {
        if (req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Not authorized to delete this team' });
        }
      } else if (team.myRole !== 'owner' && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only team owner or admin can delete the team' });
      }

      await db.deleteTeam(teamId);
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, 'Error deleting team');
      res.status(500).json({ error: 'Failed to delete team' });
    }
  });

  return router;
};
