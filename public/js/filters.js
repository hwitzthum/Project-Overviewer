// Project Overviewer — Filters & View Logic

function getWipLimits() {
  return sanitizeWipLimits(state.settings.wipLimits);
}

function getLaneProjectCount(status, excludeProjectId = null) {
  return state.projects.filter(project =>
    project.status === status && (!excludeProjectId || project.id !== excludeProjectId)
  ).length;
}

function canAssignProjectToStatus(status, excludeProjectId = null) {
  const limit = getWipLimits()[status];
  const count = getLaneProjectCount(status, excludeProjectId);
  if (!limit) {
    return { allowed: true, limit: null, count };
  }
  return { allowed: count < limit, limit, count };
}

function updateLaneWipLimit(status, rawValue) {
  const nextLimit = parseWipLimit(rawValue);
  setState(s => ({
    settings: {
      ...s.settings,
      wipLimits: {
        ...sanitizeWipLimits(s.settings.wipLimits),
        [status]: nextLimit
      }
    }
  }));
  return nextLimit;
}

function getSortValue(project, sortBy) {
  switch (sortBy) {
    case 'due-date':
      return project.dueDate ? new Date(project.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    case 'priority': {
      const rank = { high: 0, medium: 1, low: 2, none: 3 };
      const effectivePriority = project.status === 'backlog' ? 'none' : (project.priority || 'none');
      return rank[effectivePriority] ?? 3;
    }
    case 'title':
      return (project.title || '').toLowerCase();
    case 'stakeholder':
      return (project.stakeholder || '').toLowerCase();
    case 'updated':
      return new Date(project.updated_at || project.created_at || 0).getTime();
    default:
      return 0;
  }
}

function sortProjectsList(projects) {
  const sortBy = state.settings.sortBy || 'manual';
  if (sortBy === 'manual') return projects;

  const sorted = [...projects];
  sorted.sort((a, b) => {
    const aVal = getSortValue(a, sortBy);
    const bVal = getSortValue(b, sortBy);

    if (sortBy === 'updated') return bVal - aVal;
    if (aVal < bVal) return -1;
    if (aVal > bVal) return 1;
    return (a.title || '').localeCompare(b.title || '');
  });
  return sorted;
}

function getFilteredProjects() {
  let projects = [...state.projects];

  if (currentView === 'archived') {
    projects = projects.filter(p => p.archived);
  } else {
    projects = projects.filter(p => !p.archived);
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    projects = projects.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.stakeholder?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      flattenProjectTasks(p.tasks || []).some(t => t.title.toLowerCase().includes(q))
    );
  }

  let filtered = projects;
  switch (currentView) {
    case 'kanban':
      filtered = projects;
      break;
    case 'active':
    case 'in-progress':
      filtered = projects.filter(p => p.status === 'in-progress');
      break;
    case 'not-started':
      filtered = projects.filter(p => p.status === 'not-started');
      break;
    case 'backlog':
      filtered = projects.filter(p => p.status === 'backlog');
      break;
    case 'completed':
      filtered = projects.filter(p => p.status === 'completed');
      break;
    case 'archived':
      filtered = projects;
      break;
    case 'overdue':
      filtered = projects.filter(p => isOverdue(p.dueDate) && p.status !== 'completed');
      break;
    case 'today':
      filtered = projects.filter(p => isToday(p.dueDate));
      break;
    case 'week':
      filtered = projects.filter(p => isThisWeek(p.dueDate));
      break;
    case 'priority-high':
      filtered = projects.filter(p => p.status !== 'backlog' && p.priority === 'high');
      break;
    case 'priority-medium':
      filtered = projects.filter(p => p.status !== 'backlog' && p.priority === 'medium');
      break;
    case 'priority-low':
      filtered = projects.filter(p => p.status !== 'backlog' && p.priority === 'low');
      break;
    default:
      if (currentView.startsWith('stakeholder-')) {
        const stakeholder = decodeStakeholderView(currentView);
        filtered = projects.filter(p => (p.stakeholder || '') === stakeholder);
      } else if (currentView.startsWith('tag-')) {
        const tag = currentView.replace('tag-', '');
        filtered = projects.filter(p => p.tags?.includes(tag));
      }
  }

  return sortProjectsList(filtered);
}

function computeAllCounts(projects) {
  let activeCount = 0;
  let archivedCount = 0;
  const statusCounts = { 'backlog': 0, 'not-started': 0, 'in-progress': 0, 'completed': 0 };
  let overdueCount = 0;
  let todayCount = 0;
  let weekCount = 0;
  const priorityCounts = { high: 0, medium: 0, low: 0 };
  const stakeholdersMap = new Map();
  const tagCounts = new Map();
  let focusCount = 0;
  let smartOverdueCount = 0;
  let smartDueSoonCount = 0;
  let smartWaitingCount = 0;

  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    if (p.archived) { archivedCount++; continue; }
    activeCount++;

    if (statusCounts.hasOwnProperty(p.status)) statusCounts[p.status]++;

    if (p.dueDate) {
      if (isOverdue(p.dueDate) && p.status !== 'completed') overdueCount++;
      if (isToday(p.dueDate)) todayCount++;
      if (isThisWeek(p.dueDate)) weekCount++;
    }

    if (p.status !== 'backlog') {
      const pri = p.priority || 'none';
      if (pri !== 'none' && priorityCounts.hasOwnProperty(pri)) priorityCounts[pri]++;
    }

    const stakeholder = (p.stakeholder || '').trim();
    if (stakeholder) stakeholdersMap.set(stakeholder, (stakeholdersMap.get(stakeholder) || 0) + 1);

    const tags = p.tags || [];
    for (let t = 0; t < tags.length; t++) {
      tagCounts.set(tags[t], (tagCounts.get(tags[t]) || 0) + 1);
    }

    const isWaiting = ['backlog', 'not-started'].includes(p.status) && stakeholder;
    const tasks = flattenProjectTasks(p.tasks || []);
    for (let j = 0; j < tasks.length; j++) {
      const task = tasks[j];
      if (task.completed) continue;
      const taskOverdue = isOverdue(task.dueDate);
      if (taskOverdue || isToday(task.dueDate) || isThisWeek(task.dueDate)) focusCount++;
      if (taskOverdue) smartOverdueCount++;
      if (isDueWithinDays(task.dueDate, 3)) smartDueSoonCount++;
      if (isWaiting) smartWaitingCount++;
    }
  }

  return {
    activeCount, archivedCount, statusCounts,
    overdueCount, todayCount, weekCount,
    priorityCounts, stakeholdersMap, tagCounts,
    focusCount, smartOverdueCount, smartDueSoonCount, smartWaitingCount
  };
}

function updateCounts() {
  const c = computeAllCounts(state.projects);

  document.getElementById('countAll').textContent = c.activeCount;
  const countKanbanEl = document.getElementById('countKanban');
  if (countKanbanEl) countKanbanEl.textContent = c.activeCount;
  const countInProgressEl = document.getElementById('countInProgress');
  if (countInProgressEl) countInProgressEl.textContent = c.statusCounts['in-progress'];
  const countNotStartedEl = document.getElementById('countNotStarted');
  if (countNotStartedEl) countNotStartedEl.textContent = c.statusCounts['not-started'];
  document.getElementById('countBacklog').textContent = c.statusCounts['backlog'];
  document.getElementById('countCompleted').textContent = c.statusCounts['completed'];
  document.getElementById('countOverdue').textContent = c.overdueCount;
  document.getElementById('countToday').textContent = c.todayCount;
  document.getElementById('countWeek').textContent = c.weekCount;
  document.getElementById('countHigh').textContent = c.priorityCounts.high;
  document.getElementById('countMedium').textContent = c.priorityCounts.medium;
  document.getElementById('countLow').textContent = c.priorityCounts.low;
  const countArchivedEl = document.getElementById('countArchived');
  if (countArchivedEl) countArchivedEl.textContent = c.archivedCount;

  const focusEl = document.getElementById('countFocus');
  if (focusEl) focusEl.textContent = c.focusCount;
  const smartOverdueEl = document.getElementById('countSmartOverdue');
  if (smartOverdueEl) smartOverdueEl.textContent = c.smartOverdueCount;
  const smartDueSoonEl = document.getElementById('countSmartDueSoon');
  if (smartDueSoonEl) smartDueSoonEl.textContent = c.smartDueSoonCount;
  const smartWaitingEl = document.getElementById('countSmartWaiting');
  if (smartWaitingEl) smartWaitingEl.textContent = c.smartWaitingCount;

  const stakeholdersSection = document.getElementById('stakeholdersSection');
  const stakeholdersList = document.getElementById('stakeholdersList');
  if (c.stakeholdersMap.size > 0) {
    stakeholdersSection.style.display = 'block';
    const sortedStakeholders = [...c.stakeholdersMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }));

    stakeholdersList.innerHTML = sortedStakeholders.map(([stakeholder, count]) => {
      const stakeholderKey = encodeURIComponent(stakeholder);
      return `
        <div class="nav-item${currentView === 'stakeholder-' + stakeholderKey ? ' active' : ''}" data-view="stakeholder-${stakeholderKey}" tabindex="0" role="button">
          <span class="nav-item-icon">\u{1F464}</span>
          <span>${escapeHtml(stakeholder)}</span>
          <span class="nav-item-count">${count}</span>
        </div>
      `;
    }).join('');
  } else {
    stakeholdersSection.style.display = 'none';
    stakeholdersList.innerHTML = '';
  }

  const tagsSection = document.getElementById('tagsSection');
  const tagsList = document.getElementById('tagsList');
  if (c.tagCounts.size > 0) {
    tagsSection.style.display = 'block';
    tagsList.innerHTML = [...c.tagCounts.entries()].map(([tag, count]) => `
      <div class="nav-item${currentView === 'tag-' + tag ? ' active' : ''}" data-view="tag-${escapeHtml(tag)}" tabindex="0" role="button">
        <span class="nav-item-icon">\u{1F3F7}\uFE0F</span>
        <span>${escapeHtml(tag)}</span>
        <span class="nav-item-count">${count}</span>
      </div>
    `).join('');
  } else {
    tagsSection.style.display = 'none';
  }
}
