const VALID_SETTINGS_KEYS = [
  'theme',
  'defaultView',
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
  VALID_WEBHOOK_EVENTS
};
