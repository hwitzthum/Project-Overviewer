// Project Overviewer — Utility Functions

function uuid() {
  return crypto.randomUUID();
}

function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(dateStr + 'T00:00:00');
  }
  return new Date(dateStr);
}

const HTML_ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function formatStatus(status) {
  return status || 'not-started';
}

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text).replace(/[&<>"']/g, c => HTML_ESCAPE_MAP[c]);
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function formatDateInputValue(value) {
  if (!value) return '';
  const normalized = String(value).trim();
  return DATE_INPUT_PATTERN.test(normalized) ? normalized : '';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = parseLocalDate(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const diff = Math.ceil((date - today) / (1000 * 60 * 60 * 24));

  if (date < today) return { text: `${Math.abs(diff)} days overdue`, overdue: true };
  if (diff === 0) return { text: 'Today', overdue: false };
  if (diff === 1) return { text: 'Tomorrow', overdue: false };
  if (diff <= 7) return { text: `In ${diff} days`, overdue: false };
  return { text: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), overdue: false };
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  return parseLocalDate(dateStr) < new Date(new Date().toDateString());
}

function isToday(dateStr) {
  if (!dateStr) return false;
  return parseLocalDate(dateStr).toDateString() === new Date().toDateString();
}

function isThisWeek(dateStr) {
  if (!dateStr) return false;
  const date = parseLocalDate(dateStr);
  const today = new Date();
  const weekFromNow = new Date(today);
  weekFromNow.setDate(weekFromNow.getDate() + 7);
  return date >= today && date <= weekFromNow;
}

function isDueWithinDays(dateStr, days) {
  if (!dateStr) return false;
  const date = parseLocalDate(dateStr);
  const today = new Date(new Date().toDateString());
  const limit = new Date(today);
  limit.setDate(limit.getDate() + days);
  return date >= today && date <= limit;
}

function findTaskEntryById(taskId) {
  if (!taskId) return null;
  for (const project of state.projects) {
    const task = (project.tasks || []).find(t => t.id === taskId);
    if (task) return { task, project };
  }
  return null;
}

function formatDependencyLabel(entry) {
  return `${entry.project.title} — ${entry.task.title}`;
}

function getDependencyCandidates(taskId) {
  const entries = [];
  for (const project of state.projects) {
    if (project.archived) continue;
    for (const task of project.tasks || []) {
      if (task.id === taskId) continue;
      entries.push({ task, project });
    }
  }
  return entries;
}

function getUnblockedEntries(taskId) {
  if (!taskId) return [];
  const entries = [];
  for (const project of state.projects) {
    for (const task of project.tasks || []) {
      if (task.blockedBy === taskId) {
        entries.push({ task, project });
      }
    }
  }
  return entries;
}

function getAllTasksWithProjects() {
  return state.projects
    .filter(project => !project.archived)
    .flatMap(project => (project.tasks || []).map(task => ({
      task,
      project
    })));
}

function decodeStakeholderView(view) {
  const stakeholderKey = view.replace('stakeholder-', '');
  try {
    return decodeURIComponent(stakeholderKey);
  } catch (error) {
    return stakeholderKey;
  }
}

function parseWipLimit(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function sanitizeWipLimits(limits = {}) {
  return {
    backlog: parseWipLimit(limits.backlog),
    'not-started': parseWipLimit(limits['not-started']),
    'in-progress': parseWipLimit(limits['in-progress']),
    completed: parseWipLimit(limits.completed)
  };
}
