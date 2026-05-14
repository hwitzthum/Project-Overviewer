/**
 * Resolve which user IDs should be visible to the current request.
 *
 * Reads workspaceMode and teamId from the session (populated by
 * getSessionByToken) so the common case — workspace mode known, user has
 * no team — answers without any DB round trip. Personal mode returns null
 * so callers can fall back to the single-user query. Team mode with no
 * team returns the caller's userId directly. Team mode with a team falls
 * back to the team_members self-join.
 *
 * @param {object} db  The database module instance.
 * @param {string} userId  The authenticated user's ID.
 * @param {string|null|undefined} cachedWorkspaceMode  Workspace mode from session.
 * @param {string|null|undefined} cachedTeamId  Team ID from session (null = user has no team).
 * @returns {Promise<string[]|null>}  Array of team user IDs, or null for personal mode.
 */
async function resolveTeamScope(db, userId, cachedWorkspaceMode, cachedTeamId) {
  const workspaceMode =
    cachedWorkspaceMode !== undefined
      ? cachedWorkspaceMode
      : await db.getUserSetting(userId, "workspaceMode");

  if (workspaceMode !== "team" && workspaceMode !== null) {
    return null;
  }

  if (cachedTeamId === null) {
    // Session told us the user has no team — no DB round trip needed.
    return [userId];
  }
  if (cachedTeamId === undefined) {
    // Legacy path: no team info on the session, do the lookup.
    return await db.getTeamUserIds(userId);
  }
  return await db.getTeamUserIds(userId);
}

module.exports = { resolveTeamScope };
