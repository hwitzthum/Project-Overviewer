// Project Overviewer — State Management

var APP_VERSION = '1.0';

function getInitialThemePreference() {
  if (typeof document === 'undefined') return 'auto';
  return document.documentElement.getAttribute('data-theme-preference') || 'auto';
}

function getDefaultState() {
  return {
    version: APP_VERSION,
    projects: [],
    deletedProjects: [],
    trashRetentionDays: null,
    settings: {
      theme: getInitialThemePreference(),
      lastView: 'all',
      sidebarCollapsed: false,
      sortBy: 'manual',
      wipLimits: {
        backlog: null,
        'not-started': null,
        'in-progress': null,
        completed: null
      },
      swimlaneBy: null
    },
    quickNotes: '',
    templates: [
      { id: uuid(), name: 'Bug Report', tasks: ['Reproduce issue', 'Identify root cause', 'Write fix', 'Add tests', 'Deploy'] },
      { id: uuid(), name: 'Feature Request', tasks: ['Define requirements', 'Design solution', 'Implement', 'Test', 'Document'] },
      { id: uuid(), name: 'Meeting Notes', tasks: ['Review agenda', 'Take notes', 'Action items', 'Follow up'] }
    ]
  };
}

let state = getDefaultState();
const listeners = new Set();

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach(fn => fn(state));
}

function setState(updates) {
  var oldSettings = state.settings;

  if (typeof updates === 'function') {
    state = { ...state, ...updates(state) };
  } else {
    state = { ...state, ...updates };
  }
  notify();

  // If settings changed, save to API — compare by value, not reference
  var settingsChanged = false;
  if (typeof updates === 'function' || updates.settings) {
    var keys = Object.keys(state.settings);
    for (var i = 0; i < keys.length; i++) {
      if (JSON.stringify(state.settings[keys[i]]) !== JSON.stringify(oldSettings[keys[i]])) {
        settingsChanged = true;
        break;
      }
    }
  }
  if (settingsChanged) {
    var changedSettingKeys = Object.keys(state.settings).filter(function(key) {
      return JSON.stringify(state.settings[key]) !== JSON.stringify(oldSettings[key]);
    });
    saveSettings(changedSettingKeys);
  }
}

var settingsSaveTimeout = null;
var lastSavedSettings = {};
var themeSaveRequestId = 0;

async function saveThemeSettingImmediately(value) {
  const serialized = JSON.stringify(value);
  if (lastSavedSettings.theme === serialized) {
    return;
  }

  const requestId = ++themeSaveRequestId;

  try {
    await API.setSetting('theme', value);
    if (requestId === themeSaveRequestId) {
      lastSavedSettings.theme = serialized;
    }
  } catch (error) {
    console.error('Failed to save theme setting:', error);
  }
}

async function saveSettings(changedSettingKeys = []) {
  if (changedSettingKeys.includes('theme')) {
    saveThemeSettingImmediately(state.settings.theme);
  }

  clearTimeout(settingsSaveTimeout);
  settingsSaveTimeout = setTimeout(async () => {
    try {
      const changed = {};
      for (const [key, value] of Object.entries(state.settings)) {
        if (key === 'theme') continue;
        const serialized = JSON.stringify(value);
        if (lastSavedSettings[key] !== serialized) {
          changed[key] = value;
        }
      }
      if (Object.keys(changed).length > 0) {
        await API.setSettingsBulk(changed);
        for (const [key, value] of Object.entries(changed)) {
          lastSavedSettings[key] = JSON.stringify(value);
        }
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }, 1000);
}

async function updateProject(id, updates) {
  try {
    const updatedProject = await API.updateProject(id, updates);
    setState(s => ({
      projects: s.projects.map(p => p.id === id ? updatedProject : p)
    }));
    return updatedProject;
  } catch (error) {
    console.error('Failed to update project:', error);
    showToast('Failed to update project', 'error');
    return null;
  }
}

function isArchivedProject(projectId) {
  const project = state.projects.find(p => p.id === projectId);
  return Boolean(project?.archived);
}

function ensureNotArchived(projectId) {
  if (isArchivedProject(projectId)) {
    showToast('Project is archived. Restore it to make changes.', 'info');
    return false;
  }
  return true;
}

async function archiveProject(projectId) {
  const project = state.projects.find(p => p.id === projectId);
  if (!project || project.archived) return;
  const updated = await updateProject(projectId, { archived: true });
  if (updated) {
    setRenderHint({ type: 'project-update', projectId });
    render();
    showToast('Project archived', 'info', {
      actionLabel: 'Undo',
      duration: 7000,
      onAction: () => restoreProject(projectId)
    });
  }
}

async function restoreProject(projectId) {
  const project = state.projects.find(p => p.id === projectId);
  if (!project || !project.archived) return;
  const updated = await updateProject(projectId, { archived: false });
  if (updated) {
    setRenderHint({ type: 'project-update', projectId });
    render();
    showToast('Project restored', 'success');
  }
}

function buildUndoSnapshot(project, updates) {
  return Object.keys(updates).reduce((snapshot, key) => {
    snapshot[key] = project[key] !== undefined ? project[key] : null;
    return snapshot;
  }, {});
}

async function applyProjectQuickUpdate(projectId, updates, successMessage = 'Project updated') {
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return;
  if (project.archived && updates.archived !== false) {
    showToast('Project is archived. Restore it to make changes.', 'info');
    return;
  }

  const changedEntries = Object.entries(updates).filter(([key, value]) => project[key] !== value);
  if (changedEntries.length === 0) return;

  const normalizedUpdates = Object.fromEntries(changedEntries);
  var wipWarning = null;
  if (normalizedUpdates.status && normalizedUpdates.status !== project.status) {
    const wipCheck = canAssignProjectToStatus(normalizedUpdates.status, projectId);
    if (!wipCheck.allowed) {
      wipWarning = `WIP limit exceeded for ${normalizedUpdates.status} (${wipCheck.count + 1}/${wipCheck.limit})`;
    }
  }
  const undoSnapshot = buildUndoSnapshot(project, normalizedUpdates);
  const prevStatus = project.status;
  const updated = await updateProject(projectId, normalizedUpdates);
  if (!updated) return;

  setRenderHint({ type: 'project-update', projectId, prevStatus });
  render();
  if (wipWarning) {
    showToast(wipWarning, 'warning', { duration: 5000 });
  }
  showToast(successMessage, 'success', {
    actionLabel: 'Undo',
    duration: 7000,
    onAction: async () => {
      const currentProject = state.projects.find(p => p.id === projectId);
      const undoPrevStatus = currentProject ? currentProject.status : prevStatus;
      const undone = await updateProject(projectId, undoSnapshot);
      if (undone) {
        setRenderHint({ type: 'project-update', projectId, prevStatus: undoPrevStatus });
        render();
        showToast('Change undone', 'info');
      }
    }
  });
}

// Undo a delete. The server keeps the row and only clears `deleted_at`, so the
// project comes back with every task and document ID intact. This replaces an
// earlier client-side snapshot replay that re-created the project through the
// normal endpoints — that version could only work for a few seconds in the tab
// that did the delete, and handed every restored task a brand-new ID.
async function restoreDeletedProject(projectId) {
  try {
    const restored = await API.restoreProject(projectId);
    setState(s => ({
      projects: [...s.projects.filter(p => p.id !== restored.id), restored],
      deletedProjects: s.deletedProjects.filter(p => p.id !== restored.id)
    }));
    setRenderHint({ type: 'project-add', projectId: restored.id });
    render();
    showToast('Project restored', 'success');
    return true;
  } catch (error) {
    console.error('Failed to restore project:', error);
    showToast(error && error.message ? error.message : 'Failed to restore project', 'error');
    return false;
  }
}

// Trash contents live outside `projects` because the server deliberately keeps
// soft-deleted rows out of every normal read path.
async function loadDeletedProjects() {
  try {
    const result = await API.getDeletedProjects();
    setState({
      deletedProjects: result.projects || [],
      trashRetentionDays: result.retentionDays || null
    });
    return true;
  } catch (error) {
    console.error('Failed to load deleted projects:', error);
    showToast('Failed to load trash', 'error');
    return false;
  }
}

async function purgeDeletedProject(projectId) {
  try {
    await API.purgeProject(projectId);
    setState(s => ({ deletedProjects: s.deletedProjects.filter(p => p.id !== projectId) }));
    render();
    showToast('Project permanently deleted', 'info');
    return true;
  } catch (error) {
    console.error('Failed to purge project:', error);
    showToast('Failed to permanently delete project', 'error');
    return false;
  }
}

var _loadAbortController = null;

async function loadFromStorage() {
  // Cancel any in-flight load to prevent race conditions (e.g. rapid workspace toggles)
  if (_loadAbortController) _loadAbortController.abort();
  _loadAbortController = new AbortController();
  const signal = _loadAbortController.signal;

  try {
    const [projects, settings, notes, templates] = await Promise.allSettled([
      API.getAllProjects(),
      API.getAllSettings(),
      API.getQuickNotes(),
      API.getTemplates()
    ]);

    // If a newer load was triggered, discard these results
    if (signal.aborted) return;

    if (projects.status === 'fulfilled') {
      state.projects = projects.value;
    } else {
      console.error('Failed to load projects:', projects.reason);
      showToast('Failed to load data from server', 'error');
      return;
    }

    if (settings.status === 'fulfilled' && Object.keys(settings.value).length > 0) {
      var ALLOWED_SETTING_KEYS = ['theme', 'defaultView', 'sortBy', 'showCompleted',
        'showArchived', 'wipLimits', 'kanbanColumns', 'sidebarCollapsed', 'workspaceMode', 'swimlaneBy'];
      var safeSettings = {};
      for (var i = 0; i < ALLOWED_SETTING_KEYS.length; i++) {
        var k = ALLOWED_SETTING_KEYS[i];
        if (k in settings.value) safeSettings[k] = settings.value[k];
      }
      state.settings = { ...state.settings, ...safeSettings };
    }

    if (notes.status === 'fulfilled') {
      state.quickNotes = notes.value;
    }

    if (templates.status === 'fulfilled' && templates.value.length > 0) {
      state.templates = templates.value;
    }

  } catch (e) {
    if (signal.aborted) return;
    console.error('Load failed:', e);
    showToast('Failed to load data from server', 'error');
  }
}

async function exportData() {
  try {
    const data = await API.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `project-overviewer-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data exported', 'success');
  } catch (error) {
    console.error('Export failed:', error);
    showToast('Export failed', 'error');
  }
}

async function importData(file) {
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.projects) {
        await API.importData(data);
        await loadFromStorage();
        notify();
        render();
        showToast('Data imported', 'success');
      } else {
        showToast('Invalid file format', 'error');
      }
    } catch (err) {
      console.error('Import failed:', err);
      showToast('Failed to import data', 'error');
    }
  };
  reader.readAsText(file);
}


var currentView = 'all';
var lastNonProjectView = 'all';
var currentProjectId = null;
var selectedProjectId = null;
var quickActionDocxProjectId = null;
var searchQuery = '';

var currentEditingProject = null;

var currentWorkspaceMode = 'team';
var currentUserId = null;

var currentTeam = null;

// Selective rendering hints — set before calling render() to enable patching
var renderHint = null;

function setRenderHint(hint) {
  renderHint = hint;
}

function consumeRenderHint() {
  var hint = renderHint;
  renderHint = null;
  return hint;
}
