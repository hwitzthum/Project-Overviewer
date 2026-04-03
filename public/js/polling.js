const SHARED_DATA_POLL_INTERVAL_MS = 30 * 1000;
const WS_BACKSTOP_POLL_INTERVAL_MS = 120 * 1000;

function getEffectivePollInterval() {
  return (window.WS && WS.isConnected()) ? WS_BACKSTOP_POLL_INTERVAL_MS : SHARED_DATA_POLL_INTERVAL_MS;
}

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

let lastProjectFingerprint = '';
let lastTeamFingerprint = '';
let lastAdminUsersFingerprint = '';

function computeProjectFingerprint(projects) {
  if (!projects || !projects.length) return '0';
  const parts = [];
  for (const p of projects) {
    const tc = p.tasks ? p.tasks.length : 0;
    const dc = p.documents ? p.documents.length : 0;
    parts.push(`${p.id}:${p.updated_at}:${p.status}:${tc}:${dc}`);
  }
  parts.sort();
  return `${projects.length}|${parts.join('|')}`;
}

function computeTeamFingerprint(team) {
  if (!team) return '';
  const members = (team.members || []).map(m => m.user_id || m.id).sort().join(',');
  return `${team.id}:${team.name}:${members}`;
}

function computeAdminUsersFingerprint(users) {
  if (!users || !users.length) return '0';
  const parts = [];
  for (const u of users) {
    parts.push(`${u.id}:${u.role}:${u.approved}:${u.updated_at || ''}`);
  }
  parts.sort();
  return `${users.length}|${parts.join('|')}`;
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

function scheduleNextAppPoll(delay) {
  if (delay === undefined) delay = getEffectivePollInterval();
  clearTimeout(appPollingTimer);
  appPollingTimer = window.setTimeout(runAppPollingCycle, delay);
}

function scheduleNextAdminPoll(delay = SHARED_DATA_POLL_INTERVAL_MS) {
  clearTimeout(adminPollingTimer);
  adminPollingTimer = window.setTimeout(runAdminPollingCycle, delay);
}

function markSharedDataMutation() {
  sharedDataMutationVersion += 1;
  lastProjectFingerprint = '';
  lastTeamFingerprint = '';
}

function markAdminUsersMutation() {
  adminUsersMutationVersion += 1;
  lastAdminUsersFingerprint = '';
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
    const fingerprint = computeProjectFingerprint(nextProjects);
    if (fingerprint === lastProjectFingerprint) {
      return { changed: false, nextProjects: null };
    }
    lastProjectFingerprint = fingerprint;
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
    const fingerprint = computeTeamFingerprint(nextTeam);
    if (fingerprint === lastTeamFingerprint) {
      return { changed: false, nextTeam: null };
    }
    lastTeamFingerprint = fingerprint;
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

  lastProjectFingerprint = computeProjectFingerprint(state.projects);
  lastTeamFingerprint = computeTeamFingerprint(currentTeam);

  document.addEventListener('visibilitychange', handleAppVisibilityChange);
  document.addEventListener('focusout', handleAppFocusOut, true);

  scheduleNextAppPoll();
}

function syncAdminUsers(users) {
  const fingerprint = computeAdminUsersFingerprint(users);
  if (fingerprint === lastAdminUsersFingerprint) {
    return false;
  }
  lastAdminUsersFingerprint = fingerprint;

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
