const VALID_SETTINGS_KEYS = [
  'theme',
  'defaultView',
  'lastView',
  'sortBy',
  'showCompleted',
  'showArchived',
  'wipLimits',
  'kanbanColumns',
  'sidebarCollapsed',
  'workspaceMode',
  'swimlaneBy'
];

const MAX_DOCUMENTS_PER_USER = 500;
const MAX_WEBHOOKS_PER_USER = 20;

// How long a soft-deleted project stays restorable before the retention sweep
// removes it for good. 30 days matches the convention users already expect from
// Drive/Dropbox/GitHub.
const PROJECT_TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const VALID_WEBHOOK_EVENTS = [
  '*', 'project.*', 'task.*', 'document.*',
  'project.created', 'project.updated', 'project.deleted',
  'task.created', 'task.updated', 'task.deleted',
  'document.created', 'document.deleted'
];

module.exports = {
  VALID_SETTINGS_KEYS,
  MAX_DOCUMENTS_PER_USER,
  MAX_WEBHOOKS_PER_USER,
  PROJECT_TRASH_RETENTION_MS,
  VALID_WEBHOOK_EVENTS
};
