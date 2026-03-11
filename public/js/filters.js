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
      p.tasks?.some(t => t.title.toLowerCase().includes(q))
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

function updateCounts() {
  const projects = state.projects;
  const activeProjects = projects.filter(p => !p.archived);
  const archivedProjects = projects.filter(p => p.archived);
  document.getElementById('countAll').textContent = activeProjects.length;
  const countKanbanEl = document.getElementById('countKanban');
  if (countKanbanEl) countKanbanEl.textContent = activeProjects.length;
  const inProgressCount = activeProjects.filter(p => p.status === 'in-progress').length;
  const notStartedCount = activeProjects.filter(p => p.status === 'not-started').length;
  const backlogCount = activeProjects.filter(p => p.status === 'backlog').length;
  const completedCount = activeProjects.filter(p => p.status === 'completed').length;

  const countInProgressEl = document.getElementById('countInProgress');
  if (countInProgressEl) countInProgressEl.textContent = inProgressCount;
  const countNotStartedEl = document.getElementById('countNotStarted');
  if (countNotStartedEl) countNotStartedEl.textContent = notStartedCount;
  document.getElementById('countBacklog').textContent = backlogCount;
  document.getElementById('countCompleted').textContent = completedCount;
  document.getElementById('countOverdue').textContent = activeProjects.filter(p => isOverdue(p.dueDate) && p.status !== 'completed').length;
  document.getElementById('countToday').textContent = activeProjects.filter(p => isToday(p.dueDate)).length;
  document.getElementById('countWeek').textContent = activeProjects.filter(p => isThisWeek(p.dueDate)).length;
  document.getElementById('countHigh').textContent = activeProjects.filter(p => p.status !== 'backlog' && p.priority === 'high').length;
  document.getElementById('countMedium').textContent = activeProjects.filter(p => p.status !== 'backlog' && p.priority === 'medium').length;
  document.getElementById('countLow').textContent = activeProjects.filter(p => p.status !== 'backlog' && p.priority === 'low').length;
  const countArchivedEl = document.getElementById('countArchived');
  if (countArchivedEl) countArchivedEl.textContent = archivedProjects.length;

  const allTasks = getAllTasksWithProjects().filter(({ task }) => !task.completed);
  const focusCount = allTasks.filter(({ task }) =>
    isOverdue(task.dueDate) || isToday(task.dueDate) || isThisWeek(task.dueDate)
  ).length;
  const smartOverdueCount = allTasks.filter(({ task }) => isOverdue(task.dueDate)).length;
  const smartDueSoonCount = allTasks.filter(({ task }) => isDueWithinDays(task.dueDate, 3)).length;
  const smartWaitingCount = allTasks.filter(({ task, project }) =>
    !task.completed && ['backlog', 'not-started'].includes(project.status) && (project.stakeholder || '').trim()
  ).length;

  const focusEl = document.getElementById('countFocus');
  if (focusEl) focusEl.textContent = focusCount;
  const smartOverdueEl = document.getElementById('countSmartOverdue');
  if (smartOverdueEl) smartOverdueEl.textContent = smartOverdueCount;
  const smartDueSoonEl = document.getElementById('countSmartDueSoon');
  if (smartDueSoonEl) smartDueSoonEl.textContent = smartDueSoonCount;
  const smartWaitingEl = document.getElementById('countSmartWaiting');
  if (smartWaitingEl) smartWaitingEl.textContent = smartWaitingCount;

  const stakeholdersMap = new Map();
  activeProjects.forEach(project => {
    const stakeholder = (project.stakeholder || '').trim();
    if (!stakeholder) return;
    stakeholdersMap.set(stakeholder, (stakeholdersMap.get(stakeholder) || 0) + 1);
  });

  const stakeholdersSection = document.getElementById('stakeholdersSection');
  const stakeholdersList = document.getElementById('stakeholdersList');
  if (stakeholdersMap.size > 0) {
    stakeholdersSection.style.display = 'block';
    const sortedStakeholders = [...stakeholdersMap.entries()]
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

  const allTags = [...new Set(activeProjects.flatMap(p => p.tags || []))];
  const tagsSection = document.getElementById('tagsSection');
  const tagsList = document.getElementById('tagsList');
  if (allTags.length > 0) {
    tagsSection.style.display = 'block';
    tagsList.innerHTML = allTags.map(tag => `
      <div class="nav-item${currentView === 'tag-' + tag ? ' active' : ''}" data-view="tag-${escapeHtml(tag)}" tabindex="0" role="button">
        <span class="nav-item-icon">\u{1F3F7}\uFE0F</span>
        <span>${escapeHtml(tag)}</span>
        <span class="nav-item-count">${activeProjects.filter(p => p.tags?.includes(tag)).length}</span>
      </div>
    `).join('');
  } else {
    tagsSection.style.display = 'none';
  }
}