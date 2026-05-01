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

function sanitizeUrl(url, fallback) {
  if (fallback === undefined) fallback = '#';
  if (!url) return fallback;
  // Relative paths are safe
  if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) return url;
  try {
    var parsed = new URL(url, window.location.origin);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') ? url : fallback;
  } catch (e) {
    return fallback;
  }
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

  if (date < today) return { text: `${Math.abs(diff)} days overdue`, overdue: true, dueSoon: false };
  if (diff === 0) return { text: 'Today', overdue: false, dueSoon: true };
  if (diff === 1) return { text: 'Tomorrow', overdue: false, dueSoon: true };
  if (diff <= 3) return { text: `In ${diff} days`, overdue: false, dueSoon: true };
  if (diff <= 7) return { text: `In ${diff} days`, overdue: false, dueSoon: false };
  return { text: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), overdue: false, dueSoon: false };
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

function flattenProjectTasks(tasks) {
  var flattened = [];

  function walk(taskList) {
    for (var i = 0; i < taskList.length; i++) {
      var task = taskList[i];
      flattened.push(task);
      if (task.subtasks && task.subtasks.length > 0) {
        walk(task.subtasks);
      }
    }
  }

  walk(tasks || []);
  return flattened;
}

function findTaskInProject(project, taskId) {
  var tasks = flattenProjectTasks((project && project.tasks) || []);
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === taskId) return tasks[i];
  }
  return null;
}

function findTaskEntryById(taskId) {
  if (!taskId) return null;
  for (const project of state.projects) {
    const task = findTaskInProject(project, taskId);
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
    for (const task of flattenProjectTasks(project.tasks || [])) {
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
    for (const task of flattenProjectTasks(project.tasks || [])) {
      if (task.blockedBy === taskId) {
        entries.push({ task, project });
      }
    }
  }
  return entries;
}

function getAllTasksWithProjects() {
  var entries = [];
  var projects = state.projects.filter(function(project) { return !project.archived; });
  for (var i = 0; i < projects.length; i++) {
    var project = projects[i];
    var tasks = flattenProjectTasks(project.tasks || []);
    for (var j = 0; j < tasks.length; j++) {
      entries.push({ task: tasks[j], project: project });
    }
  }
  return entries;
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
