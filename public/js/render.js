// Project Overviewer — Render Functions

function renderProjectCard(project) {
  const dueInfo = formatDate(project.dueDate);
  const effectivePriority = project.status === 'backlog' ? 'none' : (project.priority || 'none');
  const completedTasks = (project.tasks || []).filter(t => t.completed).length;
  const totalTasks = (project.tasks || []).length;
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const isArchived = project.archived;
  const disabledAttr = isArchived ? 'disabled' : '';

  return `
    <div class="project-card${isArchived ? ' archived' : ''}${selectedProjectId === project.id ? ' selected' : ''}" data-id="${project.id}" draggable="${isArchived ? 'false' : 'true'}">
      <div class="project-card-header">
        <div class="project-priority priority-${effectivePriority}"></div>
        <input type="text" class="project-title" value="${escapeHtml(project.title)}"
          data-id="${project.id}" aria-label="Project title" ${disabledAttr}>
        <span class="project-status status-${project.status}">${formatStatus(project.status)}</span>
        ${isArchived ? `<span class="project-status status-archived">archived</span>` : ''}
        <button class="project-delete-btn" data-id="${project.id}" aria-label="Delete project" title="Delete project">🗑️</button>
      </div>
      ${project.description ? `<p class="project-description">${escapeHtml(project.description)}</p>` : ''}
      <div class="project-meta">
        ${project.stakeholder ? `
          <span class="project-meta-item">👤 ${escapeHtml(project.stakeholder)}</span>
        ` : ''}
        ${project.dueDate ? `
          <span class="project-meta-item project-due${dueInfo.overdue ? ' overdue' : ''}">
            📅 ${dueInfo.text}
          </span>
        ` : ''}
        ${totalTasks > 0 ? `
          <span class="project-meta-item">✓ ${completedTasks}/${totalTasks}</span>
        ` : ''}
        ${currentWorkspaceMode === 'team' && project.user_id && currentUserId ? `
          <span class="project-owner-badge ${project.user_id === currentUserId ? 'is-mine' : ''}">
            ● ${escapeHtml(project.ownerName || 'Unknown')}
          </span>
        ` : ''}
      </div>
      <div class="project-quick-edit">
        <select class="quick-control quick-status" data-project-id="${project.id}" aria-label="Quick status update" ${isArchived ? 'disabled' : ''}>
          <option value="not-started" ${project.status === 'not-started' ? 'selected' : ''}>not-started</option>
          <option value="in-progress" ${project.status === 'in-progress' ? 'selected' : ''}>in-progress</option>
          <option value="completed" ${project.status === 'completed' ? 'selected' : ''}>completed</option>
          <option value="backlog" ${project.status === 'backlog' ? 'selected' : ''}>backlog</option>
        </select>
        <select class="quick-control quick-priority" data-project-id="${project.id}" aria-label="Quick priority update" ${project.status === 'backlog' || isArchived ? 'disabled' : ''}>
          <option value="none" ${effectivePriority === 'none' ? 'selected' : ''}>None</option>
          <option value="high" ${effectivePriority === 'high' ? 'selected' : ''}>High</option>
          <option value="medium" ${effectivePriority === 'medium' ? 'selected' : ''}>Medium</option>
          <option value="low" ${effectivePriority === 'low' ? 'selected' : ''}>Low</option>
        </select>
        <input type="text" class="quick-control quick-stakeholder" data-project-id="${project.id}"
          value="${escapeHtml(project.stakeholder || '')}" placeholder="Stakeholder" ${disabledAttr}>
      </div>
      ${totalTasks > 0 ? `
        <div class="project-progress">
          <div class="project-progress-bar" style="width: ${progress}%"></div>
        </div>
      ` : ''}
      ${(project.tags || []).length > 0 ? `
        <div class="project-tags">
          ${project.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
        </div>
      ` : ''}
      <div class="task-list">
        ${(project.tasks || []).slice(0, 5).map(task => `
          <div class="task-item${task.completed ? ' completed' : ''}" data-task-id="${task.id}" data-project-id="${project.id}" draggable="${isArchived ? 'false' : 'true'}">
            <span class="task-drag-handle" title="Drag to reorder">⋮⋮</span>
            <div class="task-checkbox" data-project-id="${project.id}" data-task-id="${task.id}"
              tabindex="0" role="checkbox" aria-checked="${task.completed}">
              ${task.completed ? '✓' : ''}
            </div>
            <div class="task-content">
      <input type="text" class="task-title task-title-input" value="${escapeHtml(task.title)}"
                data-project-id="${project.id}" data-task-id="${task.id}" aria-label="Task title" ${disabledAttr}>
              ${task.dueDate ? `
                <div class="task-meta">
                  <span>📅 ${formatDate(task.dueDate).text}</span>
                </div>
              ` : ''}
            </div>
          </div>
        `).join('')}
        ${(project.tasks || []).length > 5 ? `
          <div class="task-item" style="color: var(--text-tertiary); font-size: 12px;">
            +${project.tasks.length - 5} more tasks
          </div>
        ` : ''}
        <div class="doc-add" data-project-id="${project.id}">
          <span>📎</span>
          <span class="doc-add-label">${(project.documents || []).length} docs</span>
          ${isArchived
            ? `<span class="doc-add-label">Archived</span>
               <button class="btn btn-secondary btn-sm doc-manage" data-project-id="${project.id}">View</button>`
            : `
              <button class="btn btn-secondary btn-sm doc-add-email" data-project-id="${project.id}">+ Email</button>
              <label class="btn btn-secondary btn-sm">
                + Docx
                <input type="file" class="docx-input" data-project-id="${project.id}"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden>
              </label>
              <button class="btn btn-secondary btn-sm doc-manage" data-project-id="${project.id}">Manage</button>
            `}
        </div>
        <div class="task-add" data-project-id="${project.id}">
          <span>+</span>
          <input type="text" class="task-add-input" placeholder="Add a task..."
            data-project-id="${project.id}" aria-label="Add new task" ${disabledAttr}>
        </div>
        ${currentView === 'archived' ? `
          <div style="display:flex; justify-content:flex-end; margin-top: 6px;">
            <button class="btn btn-secondary btn-sm project-restore-btn" data-project-id="${project.id}">Restore</button>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function renderTaskListRow(entry, options = {}) {
  const { task, project } = entry;
  const showProject = options.showProject !== false;
  return `
    <div class="task-list-row${task.completed ? ' completed' : ''}" data-task-id="${task.id}" data-project-id="${project.id}">
      <div class="task-checkbox" data-project-id="${project.id}" data-task-id="${task.id}"
        tabindex="0" role="checkbox" aria-checked="${task.completed}">
        ${task.completed ? '✓' : ''}
      </div>
      <input type="text" class="task-title-input" value="${escapeHtml(task.title)}"
        data-project-id="${project.id}" data-task-id="${task.id}" aria-label="Task title">
      ${showProject ? `<span class="task-project-badge">${escapeHtml(project.title)}</span>` : ''}
      <input type="date" class="task-due-input" value="${formatDateInputValue(task.dueDate)}"
        data-project-id="${project.id}" data-task-id="${task.id}" aria-label="Task due date">
      <button class="btn btn-secondary btn-sm task-open-project" data-project-id="${project.id}">Open</button>
    </div>
  `;
}

function renderTaskListView(entries, emptyText = 'No tasks to show') {
  if (entries.length === 0) {
    return `<div class="empty-muted">${emptyText}</div>`;
  }
  return `
    <div class="task-list-view">
      ${entries.map(entry => renderTaskListRow(entry)).join('')}
    </div>
  `;
}

function renderFocusView() {
  const entries = getAllTasksWithProjects().filter(({ task }) => !task.completed);
  const overdue = entries.filter(({ task }) => isOverdue(task.dueDate));
  const today = entries.filter(({ task }) => isToday(task.dueDate));
  const week = entries.filter(({ task }) => !isToday(task.dueDate) && isThisWeek(task.dueDate));
  const highNoDate = entries.filter(({ task }) => task.priority === 'high' && !task.dueDate);

  return `
    <div class="focus-columns">
      <div class="focus-column">
        <div class="focus-column-title">Overdue</div>
        ${renderTaskListView(overdue, 'No overdue tasks.')}
        <div class="focus-column-title">Today</div>
        ${renderTaskListView(today, 'Nothing due today.')}
      </div>
      <div class="focus-column">
        <div class="focus-column-title">Next 7 Days</div>
        ${renderTaskListView(week, 'No upcoming tasks.')}
        <div class="focus-column-title">High Priority (No Date)</div>
        ${renderTaskListView(highNoDate, 'No high priority tasks without dates.')}
      </div>
    </div>
  `;
}

function renderSmartListView(view) {
  const entries = getAllTasksWithProjects().filter(({ task }) => !task.completed);
  let title = '';
  let filtered = [];
  let emptyText = 'No tasks to show.';

  switch (view) {
    case 'smart-overdue':
      title = 'Overdue Tasks';
      filtered = entries.filter(({ task }) => isOverdue(task.dueDate));
      emptyText = 'No overdue tasks.';
      break;
    case 'smart-due-soon':
      title = 'Due in 3 Days';
      filtered = entries.filter(({ task }) => isDueWithinDays(task.dueDate, 3));
      emptyText = 'Nothing due in the next 3 days.';
      break;
    case 'smart-waiting':
      title = 'Waiting on Stakeholder';
      filtered = entries.filter(({ task, project }) =>
        ['backlog', 'not-started'].includes(project.status) && (project.stakeholder || '').trim()
      );
      emptyText = 'No tasks waiting on stakeholders.';
      break;
  }

  return `
    <div class="project-home">
      <div class="project-home-header">
        <div class="project-home-title">${title}</div>
      </div>
      ${renderTaskListView(filtered, emptyText)}
    </div>
  `;
}

function renderProjectHome(project) {
  const completedTasks = (project.tasks || []).filter(t => t.completed).length;
  const totalTasks = (project.tasks || []).length;
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const effectivePriority = project.status === 'backlog' ? 'none' : (project.priority || 'none');
  const isArchived = project.archived;
  const disabledAttr = isArchived ? 'disabled' : '';

  return `
    <div class="project-home" data-project-home="${project.id}">
      <div class="project-home-header">
        <div class="project-home-title">
          <button class="btn btn-secondary btn-sm" data-project-action="back">← Back</button>
          <span>${escapeHtml(project.title)}</span>
          <span class="project-status status-${project.status}">${formatStatus(project.status)}</span>
          ${isArchived ? '<span class="project-status status-archived">archived</span>' : ''}
        </div>
        <div class="project-home-actions">
          <button class="btn btn-secondary btn-sm" data-project-action="quick-edit" data-project-id="${project.id}">Quick Edit</button>
          ${isArchived
            ? `<button class="btn btn-secondary btn-sm" data-project-action="restore" data-project-id="${project.id}">Restore</button>`
            : `<button class="btn btn-secondary btn-sm" data-project-action="archive" data-project-id="${project.id}">Archive</button>`}
          <button class="btn btn-secondary btn-sm" data-project-action="delete" data-project-id="${project.id}">Delete</button>
        </div>
      </div>
      <div class="project-home-grid">
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <div class="project-section" id="projectHomeTasks" data-project-id="${project.id}">
            ${renderProjectModalTasks(project, { readOnly: project.archived })}
          </div>
          <div class="project-section" id="projectHomeDocuments" data-project-id="${project.id}">
            ${renderProjectModalDocuments(project, { readOnly: project.archived })}
          </div>
        </div>
        <div class="project-section">
          <div class="project-section-title">Details</div>
          <div class="project-details-grid">
            <div>
              <label class="settings-label">Title</label>
              <input type="text" class="project-home-field" data-field="title" data-project-id="${project.id}" value="${escapeHtml(project.title)}" ${disabledAttr}>
            </div>
            <div>
              <label class="settings-label">Stakeholder</label>
              <input type="text" class="project-home-field" data-field="stakeholder" data-project-id="${project.id}" value="${escapeHtml(project.stakeholder || '')}" ${disabledAttr}>
            </div>
            <div>
              <label class="settings-label">Status</label>
              <select class="project-home-field" data-field="status" data-project-id="${project.id}" ${disabledAttr}>
                <option value="not-started" ${project.status === 'not-started' ? 'selected' : ''}>not-started</option>
                <option value="in-progress" ${project.status === 'in-progress' ? 'selected' : ''}>in-progress</option>
                <option value="completed" ${project.status === 'completed' ? 'selected' : ''}>completed</option>
                <option value="backlog" ${project.status === 'backlog' ? 'selected' : ''}>backlog</option>
              </select>
            </div>
            <div>
              <label class="settings-label">Priority</label>
              <select class="project-home-field" data-field="priority" data-project-id="${project.id}" ${project.status === 'backlog' || isArchived ? 'disabled' : ''}>
                <option value="none" ${effectivePriority === 'none' ? 'selected' : ''}>None</option>
                <option value="low" ${effectivePriority === 'low' ? 'selected' : ''}>Low</option>
                <option value="medium" ${effectivePriority === 'medium' ? 'selected' : ''}>Medium</option>
                <option value="high" ${effectivePriority === 'high' ? 'selected' : ''}>High</option>
              </select>
            </div>
            <div>
              <label class="settings-label">Due Date</label>
              <input type="date" class="project-home-field" data-field="dueDate" data-project-id="${project.id}" value="${formatDateInputValue(project.dueDate)}" ${disabledAttr}>
            </div>
            <div>
              <label class="settings-label">Tags</label>
              <input type="text" class="project-home-field" data-field="tags" data-project-id="${project.id}" value="${escapeAttribute((project.tags || []).join(', '))}" ${disabledAttr}>
            </div>
          </div>
          <div class="project-details-grid full">
            <div>
              <label class="settings-label">Description</label>
              <textarea rows="4" class="project-home-field" data-field="description" data-project-id="${project.id}" ${disabledAttr}>${escapeHtml(project.description || '')}</textarea>
            </div>
          </div>
          <div class="project-meta">
            <span class="project-meta-item">Tasks: ${completedTasks}/${totalTasks}</span>
            <span class="project-meta-item">Docs: ${(project.documents || []).length}</span>
            <span class="project-meta-item">Progress: ${progress}%</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function formatDocumentMeta(doc) {
  const parts = [];
  if (doc.type === 'email' && doc.email) {
    if (doc.email.from) parts.push(`From: ${escapeHtml(doc.email.from)}`);
    if (doc.email.to) parts.push(`To: ${escapeHtml(doc.email.to)}`);
    if (doc.email.date) parts.push(`Date: ${escapeHtml(doc.email.date)}`);
  }
  if (doc.type === 'docx') {
    if (doc.fileName) parts.push(`File: ${escapeHtml(doc.fileName)}`);
  }
  return parts.join(' • ');
}

function renderEmailDocumentPreview(doc) {
  const email = doc.email || {};
  return `
    <div class="doc-preview-email">
      ${email.subject ? `<div class="doc-preview-heading">${escapeHtml(email.subject)}</div>` : ''}
      <div class="doc-preview-email-meta">
        ${email.from ? `<div><strong>From:</strong> ${escapeHtml(email.from)}</div>` : ''}
        ${email.to ? `<div><strong>To:</strong> ${escapeHtml(email.to)}</div>` : ''}
        ${email.date ? `<div><strong>Date:</strong> ${escapeHtml(email.date)}</div>` : ''}
      </div>
      <pre class="doc-preview-text">${escapeHtml(email.body || 'No email body provided.')}</pre>
    </div>
  `;
}

function renderProjectModalTasks(project, options = {}) {
  const tasks = project.tasks || [];
  const isArchived = options.readOnly || project.archived;
  const disabledAttr = isArchived ? 'disabled' : '';
  return `
    <div class="modal-section-header">
      <span class="modal-section-title">Tasks</span>
    </div>
    ${isArchived ? '<div class="empty-muted">Archived projects are read-only.</div>' : ''}
    <div class="modal-task-list" data-project-id="${project.id}">
      ${tasks.map(task => {
        const blockedEntry = task.blockedBy ? findTaskEntryById(task.blockedBy) : null;
        const unblocks = getUnblockedEntries(task.id);
        const unblocksText = unblocks.map(entry => `${escapeHtml(entry.project.title)}: ${escapeHtml(entry.task.title)}`).join(', ');
        return `
          <div class="modal-task-item${task.completed ? ' completed' : ''}" data-task-id="${task.id}" data-project-id="${project.id}" draggable="${isArchived ? 'false' : 'true'}">
            <span class="task-drag-handle" title="Drag to reorder">⋮⋮</span>
            <div class="task-checkbox" data-project-id="${project.id}" data-task-id="${task.id}"
              tabindex="0" role="checkbox" aria-checked="${task.completed}">
              ${task.completed ? '✓' : ''}
            </div>
            <input type="text" class="task-title-input modal-task-title" value="${escapeHtml(task.title)}"
              data-project-id="${project.id}" data-task-id="${task.id}" aria-label="Task title" ${disabledAttr}>
            <input type="date" class="modal-task-date" value="${formatDateInputValue(task.dueDate)}"
              data-project-id="${project.id}" data-task-id="${task.id}" aria-label="Task due date" ${disabledAttr}>
            ${isArchived ? '' : `
              <button class="btn-icon btn-icon-small modal-task-move" data-direction="up"
                data-project-id="${project.id}" data-task-id="${task.id}" title="Move up">↑</button>
              <button class="btn-icon btn-icon-small modal-task-move" data-direction="down"
                data-project-id="${project.id}" data-task-id="${task.id}" title="Move down">↓</button>
              <button class="btn-icon btn-icon-small modal-task-delete" data-project-id="${project.id}"
                data-task-id="${task.id}" title="Delete task">🗑️</button>
            `}
            <div class="task-dependency-row">
              <span>Blocked by</span>
              <div class="dependency-picker" data-project-id="${project.id}" data-task-id="${task.id}">
                <input type="text" class="task-blocked-by-input" placeholder="Search tasks..."
                  value="${blockedEntry ? escapeHtml(formatDependencyLabel(blockedEntry)) : ''}"
                  data-project-id="${project.id}" data-task-id="${task.id}"
                  data-blocked-by-id="${escapeAttribute(task.blockedBy || '')}"
                  data-blocked-by-label="${blockedEntry ? escapeAttribute(formatDependencyLabel(blockedEntry)) : ''}"
                  ${disabledAttr}>
                <button class="btn-icon btn-icon-small dependency-clear" data-project-id="${project.id}" data-task-id="${task.id}" title="Clear dependency" ${disabledAttr}>✕</button>
                <div class="dependency-options hidden"></div>
              </div>
              ${blockedEntry
                ? `<span class="dependency-chip">↳ ${escapeHtml(blockedEntry.project.title)}: ${escapeHtml(blockedEntry.task.title)}</span>`
                : ''}
              ${unblocks.length > 0
                ? `<span class="dependency-chip">Unblocks: ${unblocksText}</span>`
                : ''}
              <span class="dependency-chip">ID: ${task.id}</span>
            </div>
          </div>
        `;
      }).join('')}
      ${isArchived ? '' : `
        <div class="modal-task-add" data-project-id="${project.id}">
          <span>+</span>
          <input type="text" class="modal-task-add-input" placeholder="Add a task..."
            data-project-id="${project.id}" aria-label="Add new task">
        </div>
      `}
    </div>
  `;
}

function renderProjectModalDocuments(project, options = {}) {
  const documents = project.documents || [];
  const isArchived = options.readOnly || project.archived;
  return `
    <div class="modal-section-header">
      <span class="modal-section-title">Documents</span>
      ${isArchived ? '' : `
        <div class="modal-section-actions">
          <button class="btn btn-secondary btn-sm" data-doc-action="show-email" data-project-id="${project.id}">+ Email</button>
          <label class="btn btn-secondary btn-sm">
            + Docx
            <input type="file" class="docx-input" data-project-id="${project.id}"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden>
          </label>
        </div>
      `}
    </div>
    ${isArchived ? '<div class="empty-muted">Archived projects are read-only.</div>' : `
      <div class="doc-form hidden" data-doc-form="email" data-project-id="${project.id}">
        <input type="text" placeholder="Subject" data-email-field="subject">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <input type="text" placeholder="From" data-email-field="from">
          <input type="text" placeholder="To" data-email-field="to">
        </div>
        <input type="date" data-email-field="date">
        <textarea rows="4" placeholder="Email body" data-email-field="body"></textarea>
        <div class="modal-section-actions">
          <button class="btn btn-primary btn-sm" data-doc-action="save-email" data-project-id="${project.id}">Save Email</button>
          <button class="btn btn-secondary btn-sm" data-doc-action="cancel-email">Cancel</button>
        </div>
      </div>
    `}
    <div class="doc-list">
      ${documents.length > 0 ? documents.map(doc => `
        <div class="doc-item" data-doc-id="${doc.id}" data-doc-type="${doc.type}">
          <div class="doc-item-header">
            <div>
              <div class="doc-title">${doc.type === 'email' ? '📧' : '📄'} ${escapeHtml(doc.title || 'Document')}</div>
              <div class="doc-meta">${formatDocumentMeta(doc)}</div>
            </div>
            <div class="doc-actions">
              <button class="btn btn-secondary btn-sm" data-doc-action="open" data-doc-id="${doc.id}" data-project-id="${project.id}">Open</button>
              ${doc.type === 'docx'
                ? `<a class="btn btn-secondary btn-sm" href="/api/documents/${doc.id}/download">Download</a>`
                : ''}
              ${isArchived ? '' : `
                <button class="btn btn-secondary btn-sm" data-doc-action="delete" data-doc-id="${doc.id}"
                  data-project-id="${project.id}">Delete</button>
              `}
            </div>
          </div>
          <div class="doc-preview hidden" data-doc-preview="${doc.id}">
            ${doc.type === 'email'
              ? renderEmailDocumentPreview(doc)
              : `
                <div class="doc-preview-loading hidden" data-doc-preview-loading="${doc.id}">Loading preview...</div>
                <div class="doc-preview-body" data-doc-preview-body="${doc.id}"></div>
              `}
          </div>
        </div>
      `).join('') : '<div class="empty-muted">No documents yet.</div>'}
    </div>
  `;
}

function refreshProjectModalTasks(projectId) {
  const project = state.projects.find(p => p.id === projectId);
  const containers = [
    document.getElementById('projectModalTasks'),
    document.getElementById('projectHomeTasks')
  ];
  if (!project) return;
  containers.forEach(container => {
    if (container) {
      container.innerHTML = renderProjectModalTasks(project, { readOnly: project.archived });
    }
  });
}

function refreshProjectModalDocuments(projectId) {
  const project = state.projects.find(p => p.id === projectId);
  const containers = [
    document.getElementById('projectModalDocuments'),
    document.getElementById('projectHomeDocuments')
  ];
  if (!project) return;
  containers.forEach(container => {
    if (container) {
      container.innerHTML = renderProjectModalDocuments(project, { readOnly: project.archived });
    }
  });
}

function renderEmptyState() {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">📋</div>
      <h2 class="empty-state-title">No projects yet</h2>
      <p class="empty-state-desc">Create your first project to get started</p>
      <button class="btn btn-primary" id="emptyStateCreateProject" type="button">
        + New Project
      </button>
    </div>
  `;
}

function renderKanbanBoard(projects) {
  const lanes = [
    { status: 'backlog', label: 'backlog' },
    { status: 'not-started', label: 'not-started' },
    { status: 'in-progress', label: 'in-progress' },
    { status: 'completed', label: 'completed' }
  ];
  const wipLimits = getWipLimits();

  return `
    <div class="kanban-board">
      ${lanes.map(lane => {
        const laneProjects = projects.filter(p => p.status === lane.status);
        const laneTotalCount = getLaneProjectCount(lane.status);
        const limit = wipLimits[lane.status];
        const countClass = limit
          ? (laneTotalCount > limit ? ' limit-exceeded' : (laneTotalCount === limit ? ' limit-reached' : ''))
          : '';
        const countLabel = limit ? `${laneTotalCount}/${limit}` : `${laneTotalCount}`;
        return `
          <section class="kanban-lane lane-${lane.status}" data-status="${lane.status}">
            <div class="kanban-lane-header">
              <span class="kanban-lane-title">${lane.label}</span>
              <div class="kanban-lane-meta">
                <span class="kanban-lane-count${countClass}">${countLabel}</span>
                <label class="kanban-lane-limit">
                  WIP
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputmode="numeric"
                    class="kanban-limit-input"
                    data-lane-limit-status="${lane.status}"
                    value="${limit ?? ''}"
                    placeholder="∞"
                    aria-label="WIP limit for ${lane.label}">
                </label>
              </div>
            </div>
            <div class="kanban-lane-body">
              ${laneProjects.length > 0
                ? laneProjects.map(renderProjectCard).join('')
                : '<div class="kanban-empty">Drop a project here</div>'}
            </div>
          </section>
        `;
      }).join('')}
    </div>
  `;
}

function render() {
  const content = document.getElementById('content');
  if (currentView === 'project') {
    const project = state.projects.find(p => p.id === currentProjectId);
    if (project) {
      content.innerHTML = renderProjectHome(project);
    } else {
      content.innerHTML = renderEmptyState();
    }
  } else if (currentView === 'focus') {
    content.innerHTML = renderFocusView();
  } else if (currentView.startsWith('smart-')) {
    content.innerHTML = renderSmartListView(currentView);
  } else {
    const projects = getFilteredProjects();

    if (currentView === 'kanban') {
      content.innerHTML = renderKanbanBoard(projects);
    } else if (projects.length === 0) {
      if (searchQuery || currentView !== 'all') {
        content.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🔍</div>
            <h2 class="empty-state-title">No matching projects</h2>
            <p class="empty-state-desc">Try adjusting your search or filters</p>
          </div>
        `;
      } else {
        content.innerHTML = renderEmptyState();
      }
    } else {
      content.innerHTML = `
        <div class="projects-grid">
          ${projects.map(renderProjectCard).join('')}
        </div>
      `;
    }
  }

  updateCounts();
  updateQuickActions();
  attachEventListeners();
}

function renderStatistics() {
  const projects = state.projects.filter(p => !p.archived);
  const tasks = projects.flatMap(p => p.tasks || []);
  const completedTasks = tasks.filter(t => t.completed).length;
  const totalTasks = tasks.length;

  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const completedThisWeek = tasks.filter(t => {
    // For simplicity, count completed tasks (in a real app, track completedAt timestamp)
    return t.completed;
  }).length;

  const projectsByStatus = {
    'not-started': projects.filter(p => p.status === 'not-started').length,
    'in-progress': projects.filter(p => p.status === 'in-progress').length,
    'completed': projects.filter(p => p.status === 'completed').length,
    'backlog': projects.filter(p => p.status === 'backlog').length
  };

  document.getElementById('statsBody').innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${projects.length}</div>
        <div class="stat-label">Total Projects</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${completedTasks}/${totalTasks}</div>
        <div class="stat-label">Tasks Completed</div>
        <div class="stat-trend positive">${totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0}% complete</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${projectsByStatus['in-progress']}</div>
        <div class="stat-label">in-progress Projects</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${projectsByStatus['completed']}</div>
        <div class="stat-label">completed Projects</div>
      </div>
    </div>
    <div style="background: var(--bg-secondary); border-radius: var(--radius-md); padding: 20px; margin-top: 16px;">
      <div class="settings-label" style="margin-bottom: 12px;">Project Status Distribution</div>
      <div style="display: flex; height: 24px; border-radius: 4px; overflow: hidden;">
        <div style="flex: ${projectsByStatus['not-started']}; background: var(--text-tertiary);" title="not-started"></div>
        <div style="flex: ${projectsByStatus['in-progress']}; background: var(--accent);" title="in-progress"></div>
        <div style="flex: ${projectsByStatus['completed']}; background: var(--success);" title="completed"></div>
        <div style="flex: ${projectsByStatus['backlog']}; background: var(--warning);" title="backlog"></div>
      </div>
      <div style="display: flex; gap: 16px; margin-top: 12px; font-size: 12px; color: var(--text-secondary);">
        <span>⬜ not-started: ${projectsByStatus['not-started']}</span>
        <span>🔵 in-progress: ${projectsByStatus['in-progress']}</span>
        <span>🟢 completed: ${projectsByStatus['completed']}</span>
        <span>🟡 backlog: ${projectsByStatus['backlog']}</span>
      </div>
    </div>
  `;

  openModal('statsModal');
}
