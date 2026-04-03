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
  if (normalizedUpdates.status && normalizedUpdates.status !== project.status) {
    const wipCheck = canAssignProjectToStatus(normalizedUpdates.status, projectId);
    if (!wipCheck.allowed) {
      showToast(`WIP limit reached for ${normalizedUpdates.status} (${wipCheck.count}/${wipCheck.limit})`, 'error');
      render();
      return;
    }
  }
  const undoSnapshot = buildUndoSnapshot(project, normalizedUpdates);
  const prevStatus = project.status;
  const updated = await updateProject(projectId, normalizedUpdates);
  if (!updated) return;

  setRenderHint({ type: 'project-update', projectId, prevStatus });
  render();
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

async function restoreDeletedProject(deletedProject) {
  try {
    const tasks = deletedProject.tasks || [];
    const documents = deletedProject.documents || [];
    const taskIdMap = new Map();
    const createdTaskRefs = [];
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

    async function restoreTaskTree(taskList, parentTaskId) {
      for (let i = 0; i < taskList.length; i += 1) {
        const task = taskList[i];
        const created = await API.createTask(restoredProject.id, {
          title: task.title,
          completed: task.completed,
          dueDate: task.dueDate || null,
          notes: task.notes || '',
          priority: task.priority || 'none',
          recurring: task.recurring || null,
          blockedBy: null,
          parentTaskId: parentTaskId || null,
          order: i
        });
        const createdTaskId = created?.id || task.id || uuid();
        if (task.id) {
          taskIdMap.set(task.id, createdTaskId);
        }
        createdTaskRefs.push({
          newTaskId: createdTaskId,
          blockedBy: task.blockedBy || null
        });
        if (task.subtasks && task.subtasks.length > 0) {
          await restoreTaskTree(task.subtasks, createdTaskId);
        }
      }
    }

    await restoreTaskTree(tasks, null);

    for (let i = 0; i < createdTaskRefs.length; i += 1) {
      const ref = createdTaskRefs[i];
      if (!ref.blockedBy) continue;
      const mappedBlockedBy = taskIdMap.get(ref.blockedBy);
      if (mappedBlockedBy) {
        await API.updateTask(ref.newTaskId, { blockedBy: mappedBlockedBy });
      }
    }

    for (let i = 0; i < documents.length; i += 1) {
      const doc = documents[i];
      await API.createDocument(restoredProject.id, { ...doc, id: doc.id });
    }

    const refreshedProject = await API.getProject(restoredProject.id);
    setState(s => ({ projects: [...s.projects, refreshedProject] }));
    setRenderHint({ type: 'project-add', projectId: refreshedProject.id });
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
      var ALLOWED_SETTING_KEYS = ['theme', 'defaultView', 'sortBy', 'showCompleted',
        'showArchived', 'wipLimits', 'kanbanColumns', 'sidebarCollapsed', 'workspaceMode'];
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
