// Project Overviewer — State Management

var APP_VERSION = '1.0';

function getDefaultState() {
  return {
    version: APP_VERSION,
    projects: [],
    settings: {
      theme: 'auto',
      lastView: 'all',
      sidebarCollapsed: false,
      sortBy: 'manual',
      wipLimits: {
        backlog: null,
        'not-started': null,
        'in-progress': null,
        completed: null
      }
    },
    quickNotes: '',
    templates: [
      { id: uuid(), name: 'Bug Report', tasks: ['Reproduce issue', 'Identify root cause', 'Write fix', 'Add tests', 'Deploy'] },
      { id: uuid(), name: 'Feature Request', tasks: ['Define requirements', 'Design solution', 'Implement', 'Test', 'Document'] },
      { id: uuid(), name: 'Meeting Notes', tasks: ['Review agenda', 'Take notes', 'Action items', 'Follow up'] }
    ]
  };
}

var state = getDefaultState();
var listeners = new Set();

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach(fn => fn(state));
}

function setState(updates) {
  const oldSettings = { ...state.settings };

  if (typeof updates === 'function') {
    state = { ...state, ...updates(state) };
  } else {
    state = { ...state, ...updates };
  }
  notify();

  // If settings changed, save to API
  if (updates.settings || (typeof updates === 'function' && state.settings !== oldSettings)) {
    const changedSettingKeys = Object.keys(state.settings).filter(key => (
      JSON.stringify(state.settings[key]) !== JSON.stringify(oldSettings[key])
    ));
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
      for (const [key, value] of Object.entries(state.settings)) {
        if (key === 'theme') continue;
        const serialized = JSON.stringify(value);
        if (lastSavedSettings[key] !== serialized) {
          await API.setSetting(key, value);
          lastSavedSettings[key] = serialized;
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
  if (normalizedUpdates.status && normalizedUpdates.status !== project.status) {
    const wipCheck = canAssignProjectToStatus(normalizedUpdates.status, projectId);
    if (!wipCheck.allowed) {
      showToast(`WIP limit reached for ${normalizedUpdates.status} (${wipCheck.count}/${wipCheck.limit})`, 'error');
      render();
      return;
    }
  }
  const undoSnapshot = buildUndoSnapshot(project, normalizedUpdates);
  const updated = await updateProject(projectId, normalizedUpdates);
  if (!updated) return;

  render();
  showToast(successMessage, 'success', {
    actionLabel: 'Undo',
    duration: 7000,
    onAction: async () => {
      const undone = await updateProject(projectId, undoSnapshot);
      if (undone) {
        render();
        showToast('Change undone', 'info');
      }
    }
  });
}

async function restoreDeletedProject(deletedProject) {
  try {
    const tasks = deletedProject.tasks || [];
    const documents = deletedProject.documents || [];
    const restoredProject = await API.createProject({
      id: deletedProject.id,
      title: deletedProject.title,
      stakeholder: deletedProject.stakeholder || '',
      description: deletedProject.description || '',
      status: deletedProject.status || 'not-started',
      priority: deletedProject.priority || 'none',
      dueDate: deletedProject.dueDate || null,
      tags: deletedProject.tags || [],
      archived: deletedProject.archived || false,
      order: deletedProject.project_order ?? deletedProject.order ?? state.projects.length
    });

    for (let i = 0; i < tasks.length; i += 1) {
      const task = tasks[i];
      await API.createTask(restoredProject.id, {
        id: task.id,
        title: task.title,
        completed: task.completed,
        dueDate: task.dueDate || null,
        notes: task.notes || '',
        priority: task.priority || 'none',
        recurring: task.recurring || null,
        blockedBy: task.blockedBy || null,
        order: i
      });
    }

    for (let i = 0; i < documents.length; i += 1) {
      const doc = documents[i];
      await API.createDocument(restoredProject.id, { ...doc, id: doc.id });
    }

    const refreshedProject = await API.getProject(restoredProject.id);
    setState(s => ({ projects: [...s.projects, refreshedProject] }));
    render();
    showToast('Project restored', 'success');
  } catch (error) {
    console.error('Failed to restore project:', error);
    showToast('Failed to undo delete', 'error');
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
      state.settings = { ...state.settings, ...settings.value };
    }

    if (notes.status === 'fulfilled') {
      state.quickNotes = notes.value;
    }

    if (templates.status === 'fulfilled' && templates.value.length > 0) {
      state.templates = templates.value;
    }

    showToast('Data loaded', 'success');
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
