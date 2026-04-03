// Project Overviewer — Render Functions

function flattenAllTasks(tasks) {
  var result = [];
  for (var i = 0; i < tasks.length; i++) {
    result.push(tasks[i]);
    if (tasks[i].subtasks) {
      for (var j = 0; j < tasks[i].subtasks.length; j++) {
        result.push(tasks[i].subtasks[j]);
      }
    }
  }
  return result;
}

function renderProjectCard(project, options) {
  var compact = options && options.compact;
  const dueInfo = formatDate(project.dueDate);
  const effectivePriority = project.status === 'backlog' ? 'none' : (project.priority || 'none');
  const allTasks = flattenAllTasks(project.tasks || []);
  const completedTasks = allTasks.filter(t => t.completed).length;
  const totalTasks = allTasks.length;
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const isArchived = project.archived;
  const disabledAttr = isArchived ? 'disabled' : '';

  if (compact) {
    const daysSinceUpdate = Math.floor((Date.now() - new Date(project.updated_at || project.created_at || 0)) / 86400000);
    const agingClass = daysSinceUpdate >= 14 ? ' card-aging-stale' : daysSinceUpdate >= 7 ? ' card-aging-mild' : '';
    const hasBlockedTask = flattenAllTasks(project.tasks || []).some(t => t.blockedBy);
    const daysInStatus = project.statusChangedAt
      ? Math.floor((Date.now() - new Date(project.statusChangedAt)) / 86400000)
      : null;
    const cycleClass = daysInStatus !== null && daysInStatus >= 14 ? ' cycle-danger'
      : daysInStatus !== null && daysInStatus >= 7 ? ' cycle-warn' : '';
    return `
      <div class="project-card project-card-compact${agingClass}${selectedProjectId === project.id ? ' selected' : ''}" data-id="${project.id}" draggable="true">
        <span class="project-drag-handle" title="Drag to move">⋮⋮</span>
        <div class="project-priority priority-${effectivePriority}"></div>
        <span class="project-card-compact-title">${escapeHtml(project.title)}</span>
        <span class="project-status status-${project.status}">${formatStatus(project.status)}</span>
        ${totalTasks > 0 ? `<span class="project-meta-item">✓ ${completedTasks}/${totalTasks}</span>` : ''}
        ${project.dueDate ? `<span class="project-meta-item project-due${dueInfo.overdue ? ' overdue' : ''}">📅 ${dueInfo.text}</span>` : ''}
        ${hasBlockedTask ? `<span class="card-blocked-badge" title="Has blocked tasks">⛔ blocked</span>` : ''}
        ${daysInStatus !== null && daysInStatus > 0
          ? `<span class="card-cycle-time${cycleClass}" title="Days in current status">${daysInStatus}d</span>`
          : ''}
        ${currentWorkspaceMode === 'team' && project.user_id && currentUserId ? (() => {
          const ownerName = project.ownerName || 'Unknown';
          const initials = ownerName.split(' ').map(w => w[0] || '').slice(0, 2).join('').toUpperCase() || '?';
          const isMine = project.user_id === currentUserId;
          return `<span class="owner-avatar${isMine ? ' is-mine' : ''}" title="${escapeHtml(ownerName)}">${escapeHtml(initials)}</span>`;
        })() : ''}
      </div>
    `;
  }

  return `
    <div class="project-card${isArchived ? ' archived' : ''}${selectedProjectId === project.id ? ' selected' : ''}" data-id="${project.id}" draggable="${isArchived ? 'false' : 'true'}">
      <span class="project-drag-handle" title="Drag to reorder">⋮⋮</span>
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
              ${task.subtasks && task.subtasks.length > 0 ? `<span class="subtask-count">(+${task.subtasks.length} subtask${task.subtasks.length !== 1 ? 's' : ''})</span>` : ''}
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
  const allHomeTasks = flattenAllTasks(project.tasks || []);
  const completedTasks = allHomeTasks.filter(t => t.completed).length;
  const totalTasks = allHomeTasks.length;
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

function renderModalTaskItem(task, project, isArchived, isSubtask) {
  const disabledAttr = isArchived ? 'disabled' : '';
  const subtaskClass = isSubtask ? ' subtask' : '';
  const blockedEntry = task.blockedBy ? findTaskEntryById(task.blockedBy) : null;
  const unblocks = getUnblockedEntries(task.id);
  const unblocksText = unblocks.map(entry => `${escapeHtml(entry.project.title)}: ${escapeHtml(entry.task.title)}`).join(', ');
  const subtaskCount = (task.subtasks && task.subtasks.length > 0) ? task.subtasks.length : 0;

  return `
    <div class="modal-task-item${task.completed ? ' completed' : ''}${subtaskClass}" data-task-id="${task.id}" data-project-id="${project.id}" ${isSubtask ? `data-parent-task-id="${task.parentTaskId}"` : ''} draggable="${isArchived || isSubtask ? 'false' : 'true'}">
      <span class="task-drag-handle" title="Drag to reorder">${isSubtask ? '' : '⋮⋮'}</span>
      <div class="task-checkbox" data-project-id="${project.id}" data-task-id="${task.id}"
        tabindex="0" role="checkbox" aria-checked="${task.completed}">
        ${task.completed ? '✓' : ''}
      </div>
      <input type="text" class="task-title-input modal-task-title" value="${escapeHtml(task.title)}"
        data-project-id="${project.id}" data-task-id="${task.id}" aria-label="Task title" ${disabledAttr}>
      ${!isSubtask && subtaskCount > 0 ? `<span class="subtask-count">${subtaskCount} subtask${subtaskCount !== 1 ? 's' : ''}</span>` : ''}
      <input type="date" class="modal-task-date" value="${formatDateInputValue(task.dueDate)}"
        data-project-id="${project.id}" data-task-id="${task.id}" aria-label="Task due date" ${disabledAttr}>
      ${isArchived ? '' : `
        ${isSubtask ? '' : `
        <button class="btn-icon btn-icon-small modal-task-move" data-direction="up"
          data-project-id="${project.id}" data-task-id="${task.id}" title="Move up">↑</button>
        <button class="btn-icon btn-icon-small modal-task-move" data-direction="down"
          data-project-id="${project.id}" data-task-id="${task.id}" title="Move down">↓</button>
        `}
        ${!isSubtask ? `<button class="btn-icon btn-icon-small add-subtask-btn" data-project-id="${project.id}" data-task-id="${task.id}" title="Add subtask">+sub</button>` : ''}
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
}

function renderProjectModalTasks(project, options = {}) {
  const tasks = project.tasks || [];
  const isArchived = options.readOnly || project.archived;
  let taskHtml = '';
  for (const task of tasks) {
    taskHtml += renderModalTaskItem(task, project, isArchived, false);
    // Render subtasks indented after parent
    if (task.subtasks && task.subtasks.length > 0) {
      for (const sub of task.subtasks) {
        taskHtml += renderModalTaskItem(sub, project, isArchived, true);
      }
      if (!isArchived) {
        taskHtml += `
          <div class="subtask-add" data-project-id="${project.id}" data-parent-task-id="${task.id}">
            <span>+</span>
            <input type="text" class="subtask-add-input" placeholder="Add subtask..."
              data-project-id="${project.id}" data-parent-task-id="${task.id}" aria-label="Add subtask">
          </div>
        `;
      }
    }
  }

  return `
    <div class="modal-section-header">
      <span class="modal-section-title">Tasks</span>
    </div>
    ${isArchived ? '<div class="empty-muted">Archived projects are read-only.</div>' : ''}
    <div class="modal-task-list" data-project-id="${project.id}">
      ${taskHtml}
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
                ? `<a class="btn btn-secondary btn-sm" href="${escapeAttribute(buildApiPath(`/api/documents/${doc.id}/download`))}">Download</a>`
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

function renderKanbanSwimlanes(projects) {
  const lanes = [
    { status: 'backlog', label: 'backlog' },
    { status: 'not-started', label: 'not-started' },
    { status: 'in-progress', label: 'in-progress' },
    { status: 'completed', label: 'completed' }
  ];
  const priorityGroups = [
    { priority: 'high', label: 'High' },
    { priority: 'medium', label: 'Medium' },
    { priority: 'low', label: 'Low' },
    { priority: 'none', label: 'None' }
  ];

  function effectivePriority(p) {
    return p.status === 'backlog' ? 'none' : (p.priority || 'none');
  }

  const laneHeadersHtml = lanes.map(lane => `
    <div class="swimlane-col-header lane-${lane.status}">
      <span>${lane.label}</span>
    </div>
  `).join('');

  const rowsHtml = priorityGroups.map(group => {
    const cellsHtml = lanes.map(lane => {
      const cellProjects = projects.filter(p => p.status === lane.status && effectivePriority(p) === group.priority);
      return `
        <div class="swimlane-cell kanban-lane lane-${lane.status}" data-status="${lane.status}">
          ${cellProjects.length > 0
            ? cellProjects.map(p => renderProjectCard(p, { compact: true })).join('')
            : '<div class="kanban-empty">Drop here</div>'}
        </div>
      `;
    }).join('');
    return `
      <div class="swimlane-row">
        <div class="swimlane-row-label priority-${group.priority}">${group.label}</div>
        ${cellsHtml}
      </div>
    `;
  }).join('');

  return `
    <div class="kanban-board kanban-swimlanes">
      <div class="swimlane-header-row">
        <div class="swimlane-row-label"></div>
        ${laneHeadersHtml}
      </div>
      ${rowsHtml}
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
  const completedThisWeek = projects.filter(p =>
    p.status === 'completed' &&
    Date.now() - new Date(p.updated_at || 0) < 7 * 86400000
  ).length;

  if (state.settings.swimlaneBy === 'priority') {
    return `
      <div class="kanban-wrapper">
        <div class="kanban-toolbar">
          <button class="kanban-swimlane-toggle active" type="button" title="Toggle priority swimlanes">
            ⊞ Swimlanes (on)
          </button>
        </div>
        ${renderKanbanSwimlanes(projects)}
      </div>
    `;
  }

  return `
    <div class="kanban-wrapper">
      <div class="kanban-toolbar">
        <button class="kanban-swimlane-toggle" type="button" title="Toggle priority swimlanes">
          ⊞ Swimlanes (off)
        </button>
      </div>
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
              ${lane.status === 'completed' && completedThisWeek > 0
                ? `<div class="lane-throughput">${completedThisWeek} completed this week</div>`
                : ''}
              <div class="kanban-lane-body">
                ${laneProjects.length > 0
                  ? laneProjects.map(function(p) { return renderProjectCard(p, { compact: true }); }).join('')
                  : '<div class="kanban-empty">Drop a project here</div>'}
              </div>
            </section>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// --- Selective Rendering Helpers ---

function htmlToElement(html) {
  var doc = new DOMParser().parseFromString(html.trim(), 'text/html');
  return doc.body.firstElementChild;
}

function createKanbanEmptyPlaceholder() {
  var el = document.createElement('div');
  el.className = 'kanban-empty';
  el.textContent = 'Drop a project here';
  return el;
}

function patchProjectCard(projectId) {
  var project = state.projects.find(function(p) { return p.id === projectId; });
  if (!project) return false;

  var existingCard = document.querySelector('.project-card[data-id="' + projectId + '"]');
  if (!existingCard) return false;

  var opts = currentView === 'kanban' ? { compact: true } : undefined;
  var newCard = htmlToElement(renderProjectCard(project, opts));
  existingCard.replaceWith(newCard);
  return true;
}

function moveKanbanCard(projectId, prevStatus) {
  var project = state.projects.find(function(p) { return p.id === projectId; });
  if (!project) return false;

  var newStatus = project.status;
  var existingCard = document.querySelector('.project-card[data-id="' + projectId + '"]');
  if (!existingCard) return false;

  var newCard = htmlToElement(renderProjectCard(project, { compact: true }));

  if (prevStatus === newStatus) {
    existingCard.replaceWith(newCard);
    return true;
  }

  existingCard.remove();

  var oldLane = document.querySelector('.kanban-lane[data-status="' + prevStatus + '"] .kanban-lane-body');
  if (oldLane && oldLane.querySelectorAll('.project-card').length === 0) {
    oldLane.replaceChildren(createKanbanEmptyPlaceholder());
  }

  var newLane = document.querySelector('.kanban-lane[data-status="' + newStatus + '"] .kanban-lane-body');
  if (!newLane) return false;

  var empty = newLane.querySelector('.kanban-empty');
  if (empty) empty.remove();

  newLane.appendChild(newCard);
  updateKanbanLaneCounts();
  return true;
}

function updateKanbanLaneCounts() {
  var wipLimits = getWipLimits();
  var lanes = ['backlog', 'not-started', 'in-progress', 'completed'];

  for (var i = 0; i < lanes.length; i++) {
    var status = lanes[i];
    var countEl = document.querySelector('.kanban-lane[data-status="' + status + '"] .kanban-lane-count');
    if (!countEl) continue;

    var laneTotalCount = getLaneProjectCount(status);
    var limit = wipLimits[status];
    var countLabel = limit ? laneTotalCount + '/' + limit : '' + laneTotalCount;

    countEl.textContent = countLabel;
    countEl.className = 'kanban-lane-count';
    if (limit) {
      if (laneTotalCount > limit) countEl.classList.add('limit-exceeded');
      else if (laneTotalCount === limit) countEl.classList.add('limit-reached');
    }
  }
}

function addProjectCardToDOM(projectId) {
  var project = state.projects.find(function(p) { return p.id === projectId; });
  if (!project) return false;

  var filteredProjects = getFilteredProjects();
  var isVisible = filteredProjects.some(function(p) { return p.id === projectId; });
  if (!isVisible) return true;

  var opts = currentView === 'kanban' ? { compact: true } : undefined;
  var newCard = htmlToElement(renderProjectCard(project, opts));

  if (currentView === 'kanban') {
    var lane = document.querySelector('.kanban-lane[data-status="' + project.status + '"] .kanban-lane-body');
    if (!lane) return false;

    var empty = lane.querySelector('.kanban-empty');
    if (empty) empty.remove();

    lane.appendChild(newCard);
    updateKanbanLaneCounts();
    return true;
  }

  var grid = document.querySelector('.projects-grid');
  if (!grid) return false;

  grid.appendChild(newCard);
  return true;
}

function removeProjectCardFromDOM(projectId) {
  var card = document.querySelector('.project-card[data-id="' + projectId + '"]');
  if (!card) return true;

  if (currentView === 'kanban') {
    var laneBody = card.closest('.kanban-lane-body');
    card.remove();

    if (laneBody && laneBody.querySelectorAll('.project-card').length === 0) {
      laneBody.replaceChildren(createKanbanEmptyPlaceholder());
    }

    updateKanbanLaneCounts();
    return true;
  }

  var grid = card.closest('.projects-grid');
  card.remove();

  if (grid && grid.querySelectorAll('.project-card').length === 0) {
    return false;
  }

  return true;
}

function isCardInCorrectPosition(projectId) {
  var sortBy = state.settings.sortBy || 'manual';
  if (sortBy === 'manual') return true;

  var filteredProjects = getFilteredProjects();
  var expectedIndex = filteredProjects.findIndex(function(p) { return p.id === projectId; });
  if (expectedIndex === -1) return true;

  var cards = document.querySelectorAll('.projects-grid .project-card');
  if (cards.length === 0) return true;

  var actualIndex = Array.from(cards).findIndex(function(c) { return c.dataset.id === projectId; });
  return actualIndex === expectedIndex;
}

function trySelectiveRender(hint) {
  if (!hint) return false;

  if (['project', 'focus'].includes(currentView) || currentView.startsWith('smart-')) return false;

  var content = document.getElementById('content');
  if (!content) return false;

  var activeEl = document.activeElement;
  if (hint.projectId && activeEl) {
    var card = activeEl.closest('.project-card');
    if (card && card.dataset.id === hint.projectId) return false;
  }

  switch (hint.type) {
    case 'project-update': {
      var project = state.projects.find(function(p) { return p.id === hint.projectId; });
      var filteredProjects = getFilteredProjects();
      var isVisible = filteredProjects.some(function(p) { return p.id === hint.projectId; });
      var existsInDOM = !!document.querySelector('.project-card[data-id="' + hint.projectId + '"]');

      if (!isVisible && existsInDOM) {
        return removeProjectCardFromDOM(hint.projectId);
      }

      if (isVisible && !existsInDOM) {
        return addProjectCardToDOM(hint.projectId);
      }

      if (!isVisible && !existsInDOM) return true;

      if (currentView === 'kanban' && hint.prevStatus && hint.prevStatus !== (project && project.status)) {
        if (!moveKanbanCard(hint.projectId, hint.prevStatus)) return false;
      } else {
        if (!patchProjectCard(hint.projectId)) return false;
      }

      if (currentView !== 'kanban' && !isCardInCorrectPosition(hint.projectId)) {
        return false;
      }

      return true;
    }

    case 'project-add':
      return addProjectCardToDOM(hint.projectId);

    case 'project-remove':
      return removeProjectCardFromDOM(hint.projectId);

    default:
      return false;
  }
}

// --- Full Render (rebuilds entire content area) ---

function fullRender() {
  document.documentElement.classList.add('rendering');
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
  document.documentElement.classList.remove('rendering');
}

function render() {
  var hint = consumeRenderHint();

  if (hint && trySelectiveRender(hint)) {
    updateCounts();
    updateQuickActions();
    return;
  }

  fullRender();
}

function renderStatistics() {
  const projects = state.projects.filter(p => !p.archived);
  const tasks = projects.flatMap(p => flattenAllTasks(p.tasks || []));
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
