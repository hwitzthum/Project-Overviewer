const SHARED_DATA_POLL_INTERVAL_MS = 30 * 1000;

let appPollingStarted = false;
let appPollingTimer = null;
let appPollingInFlight = false;
let pendingProjectRender = false;
let pendingProjectSupplementalRefresh = false;
let pendingTeamRender = false;
let sharedDataMutationVersion = 0;

let adminPollingStarted = false;
let adminPollingTimer = null;
let adminPollingInFlight = false;
let adminUsersMutationVersion = 0;

function serializeForComparison(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch (error) {
    console.error('Failed to serialize polling payload:', error);
    return String(Date.now());
  }
}

function isEditableElement(element) {
  if (!element) return false;
  const tagName = element.tagName;
  return element.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
}

function isBusyWithin(selector) {
  const activeElement = document.activeElement;
  return Boolean(activeElement && activeElement.closest(selector) && isEditableElement(activeElement));
}

function normalizeTeamPayload(payload) {
  if (!payload || payload.team === null) return null;
  if (payload.team !== undefined) return payload.team || null;
  return payload.id ? payload : null;
}

function scheduleNextAppPoll(delay = SHARED_DATA_POLL_INTERVAL_MS) {
  clearTimeout(appPollingTimer);
  appPollingTimer = window.setTimeout(runAppPollingCycle, delay);
}

function scheduleNextAdminPoll(delay = SHARED_DATA_POLL_INTERVAL_MS) {
  clearTimeout(adminPollingTimer);
  adminPollingTimer = window.setTimeout(runAdminPollingCycle, delay);
}

function markSharedDataMutation() {
  sharedDataMutationVersion += 1;
}

function markAdminUsersMutation() {
  adminUsersMutationVersion += 1;
}

function applyPendingProjectRender() {
  if (!pendingProjectRender || isBusyWithin('#content')) return;

  pendingProjectRender = false;

  if (currentView === 'project' && currentProjectId && !state.projects.find(project => project.id === currentProjectId)) {
    closeProjectHome();
    return;
  }

  updateViewTitle();
  render();
}

function applyPendingProjectSupplementalRefresh() {
  if (!pendingProjectSupplementalRefresh) return;
  if (currentView === 'project' && isBusyWithin('#content')) return;

  const projectModal = document.getElementById('projectModal');
  if (projectModal?.classList.contains('active')) {
    if (isBusyWithin('#projectModal')) return;

    const project = state.projects.find(entry => entry.id === currentEditingProject);
    if (!project) {
      closeModal('projectModal');
      currentEditingProject = null;
    } else {
      const title = document.getElementById('projectModalTitle');
      if (title) title.textContent = project.title;
      refreshProjectModalTasks(currentEditingProject);
      refreshProjectModalDocuments(currentEditingProject);
    }
  }

  pendingProjectSupplementalRefresh = false;
}

function renderCurrentTeamPanel() {
  const container = document.getElementById('teamContent');
  if (!container) {
    pendingTeamRender = false;
    return;
  }
  if (isBusyWithin('#teamContent')) return;

  container.textContent = '';
  if (currentTeam) {
    renderTeamPanel(container, currentTeam);
  } else {
    renderNoTeam(container);
  }

  pendingTeamRender = false;
}

function flushPendingAppRefreshes() {
  applyPendingProjectRender();
  applyPendingProjectSupplementalRefresh();
  if (pendingTeamRender) {
    renderCurrentTeamPanel();
  }
}

async function pollProjects() {
  try {
    const nextProjects = await API.getAllProjects();
    if (serializeForComparison(state.projects) === serializeForComparison(nextProjects)) {
      return { changed: false, nextProjects: null };
    }
    return { changed: true, nextProjects };
  } catch (error) {
    console.error('Shared project polling failed:', error);
    return { changed: false, nextProjects: null };
  }
}

async function pollTeamInfo() {
  if (isBusyWithin('#teamContent')) {
    return { changed: false, nextTeam: null };
  }

  try {
    const payload = await API.getMyTeam();
    const nextTeam = normalizeTeamPayload(payload);
    if (serializeForComparison(currentTeam) === serializeForComparison(nextTeam)) {
      return { changed: false, nextTeam: null };
    }
    return { changed: true, nextTeam };
  } catch (error) {
    console.error('Team polling failed:', error);
    return { changed: false, nextTeam: null };
  }
}

async function runAppPollingCycle() {
  if (!appPollingStarted) return;
  if (document.hidden) {
    scheduleNextAppPoll();
    return;
  }
  if (appPollingInFlight) {
    scheduleNextAppPoll();
    return;
  }

  appPollingInFlight = true;
  const pollVersion = sharedDataMutationVersion;
  try {
    const [projectsResult, teamResult] = await Promise.all([pollProjects(), pollTeamInfo()]);
    if (pollVersion !== sharedDataMutationVersion) {
      return;
    }

    if (projectsResult.changed) {
      state.projects = projectsResult.nextProjects;
      notify();
      pendingProjectRender = true;
      pendingProjectSupplementalRefresh = true;
    }

    if (teamResult.changed) {
      currentTeam = teamResult.nextTeam;
      pendingTeamRender = true;
    }

    flushPendingAppRefreshes();
  } finally {
    appPollingInFlight = false;
    scheduleNextAppPoll();
  }
}

function handleAppVisibilityChange() {
  if (!appPollingStarted || document.hidden) return;
  scheduleNextAppPoll(0);
}

function handleAppFocusOut() {
  if (!appPollingStarted) return;
  window.setTimeout(flushPendingAppRefreshes, 0);
}

function startAppPolling() {
  if (appPollingStarted) return;
  appPollingStarted = true;

  document.addEventListener('visibilitychange', handleAppVisibilityChange);
  document.addEventListener('focusout', handleAppFocusOut, true);

  scheduleNextAppPoll();
}

function syncAdminUsers(users) {
  if (serializeForComparison(adminUsers) === serializeForComparison(users)) {
    return false;
  }

  adminUsers = users;
  renderAdminStats();
  renderPendingUsers();
  renderAllAdminUsers();
  return true;
}

async function runAdminPollingCycle() {
  if (!adminPollingStarted) return;
  if (document.hidden) {
    scheduleNextAdminPoll();
    return;
  }
  if (adminPollingInFlight) {
    scheduleNextAdminPoll();
    return;
  }

  adminPollingInFlight = true;
  const pollVersion = adminUsersMutationVersion;
  try {
    const users = await API.getUsers();
    if (pollVersion !== adminUsersMutationVersion) {
      return;
    }
    syncAdminUsers(users);
  } catch (error) {
    console.error('Admin polling failed:', error);
  } finally {
    adminPollingInFlight = false;
    scheduleNextAdminPoll();
  }
}

function handleAdminVisibilityChange() {
  if (!adminPollingStarted || document.hidden) return;
  scheduleNextAdminPoll(0);
}

function startAdminPolling() {
  if (adminPollingStarted) return;
  adminPollingStarted = true;

  document.addEventListener('visibilitychange', handleAdminVisibilityChange);
  scheduleNextAdminPoll();
}

window.markSharedDataMutation = markSharedDataMutation;
window.markAdminUsersMutation = markAdminUsersMutation;
