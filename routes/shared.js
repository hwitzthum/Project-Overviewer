/**
 * Shared route utilities.
 *
 * @param {object} db  The database module instance.
 * @param {string} userId  The authenticated user's ID.
 * @param {string|null|undefined} cachedWorkspaceMode  Optional workspace mode
 *   already loaded (e.g. from the session). When provided the DB lookup is skipped.
 * @returns {Promise<string[]|null>}  Array of team user IDs, or null for personal mode.
 */
async function resolveTeamScope(db, userId, cachedWorkspaceMode) {
  const workspaceMode = cachedWorkspaceMode !== undefined
    ? cachedWorkspaceMode
    : await db.getUserSetting(userId, 'workspaceMode');
  let teamUserIds = null;
  if (workspaceMode === 'team' || workspaceMode === null) {
    teamUserIds = await db.getTeamUserIds(userId);
  }
  return teamUserIds;
}

module.exports = { resolveTeamScope };
