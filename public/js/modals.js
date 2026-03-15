// Project Overviewer — Modal Functions
function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

function showConfirmModal(title, message, onConfirm) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  const confirmBtn = document.getElementById('confirmAction');
  confirmBtn.onclick = () => {
    onConfirm();
    closeModal('confirmModal');
  };
  openModal('confirmModal');
}

function openProjectModal(projectId, options = {}) {
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return;

  currentEditingProject = projectId;
  document.getElementById('projectModalTitle').textContent = project.title;
  const disabledAttr = project.archived ? 'disabled' : '';

  const body = document.getElementById('projectModalBody');
  body.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 16px;">
      <div class="modal-section">
        <div>
          <label class="settings-label">Title</label>
          <input type="text" id="editTitle" value="${escapeHtml(project.title)}" style="width:100%;" ${disabledAttr}>
        </div>
        <div>
          <label class="settings-label">Stakeholder</label>
          <input type="text" id="editStakeholder" value="${escapeHtml(project.stakeholder || '')}" style="width:100%;" ${disabledAttr}>
        </div>
        <div>
          <label class="settings-label">Description</label>
          <textarea id="editDescription" rows="3" style="width:100%;" ${disabledAttr}>${escapeHtml(project.description || '')}</textarea>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div>
            <label class="settings-label">Status</label>
            <select id="editStatus" style="width:100%; padding: 8px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-primary);" ${disabledAttr}>
              <option value="not-started" ${project.status === 'not-started' ? 'selected' : ''}>not-started</option>
              <option value="in-progress" ${project.status === 'in-progress' ? 'selected' : ''}>in-progress</option>
              <option value="completed" ${project.status === 'completed' ? 'selected' : ''}>completed</option>
              <option value="backlog" ${project.status === 'backlog' ? 'selected' : ''}>backlog</option>
            </select>
          </div>
          <div id="editPriorityGroup">
            <label class="settings-label">Priority</label>
            <select id="editPriority" style="width:100%; padding: 8px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-primary);" ${project.archived ? 'disabled' : ''}>
              <option value="none" ${project.priority === 'none' ? 'selected' : ''}>None</option>
              <option value="low" ${project.priority === 'low' ? 'selected' : ''}>Low</option>
              <option value="medium" ${project.priority === 'medium' ? 'selected' : ''}>Medium</option>
              <option value="high" ${project.priority === 'high' ? 'selected' : ''}>High</option>
            </select>
          </div>
        </div>
        <div>
          <label class="settings-label">Due Date</label>
          <input type="date" id="editDueDate" value="${formatDateInputValue(project.dueDate)}" style="width:100%;" ${disabledAttr}>
        </div>
        <div>
          <label class="settings-label">Tags (comma-separated)</label>
          <input type="text" id="editTags" value="${escapeAttribute((project.tags || []).join(', '))}" placeholder="design, frontend, urgent" style="width:100%;" ${disabledAttr}>
        </div>
      </div>
      <div class="modal-section" id="projectModalTasks" data-project-id="${project.id}">
        ${renderProjectModalTasks(project, { readOnly: project.archived })}
      </div>
      <div class="modal-section" id="projectModalDocuments" data-project-id="${project.id}">
        ${renderProjectModalDocuments(project, { readOnly: project.archived })}
      </div>
    </div>
  `;

  // Attach change listeners with debounce to avoid redundant saves
  let saveDebounceTimer = null;
  const debouncedSave = () => {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => saveProjectEdits(projectId), 300);
  };
  ['editTitle', 'editStakeholder', 'editDescription', 'editStatus', 'editPriority', 'editDueDate', 'editTags'].forEach(id => {
    document.getElementById(id).addEventListener('change', debouncedSave);
    document.getElementById(id).addEventListener('blur', debouncedSave);
  });
  document.getElementById('editStatus').addEventListener('change', () => {
    updatePriorityControls('editStatus', 'editPriority', 'editPriorityGroup');
  });
  updatePriorityControls('editStatus', 'editPriority', 'editPriorityGroup');

  openModal('projectModal');

  if (options.showEmailForm) {
    const form = body.querySelector('.doc-form[data-doc-form="email"]');
    if (form) {
      form.classList.remove('hidden');
      form.querySelector('[data-email-field="subject"]')?.focus();
      if (options.scrollToDocuments) {
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  } else if (options.scrollToDocuments) {
    const docsSection = body.querySelector('#projectModalDocuments');
    if (docsSection) {
      docsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}

function openProjectHome(projectId, options = {}) {
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return;

  if (currentView !== 'project') {
    lastNonProjectView = currentView;
  }
  currentView = 'project';
  currentProjectId = projectId;
  selectedProjectId = projectId;
  updateViewTitle();
  render();

  if (options.scrollToDocuments || options.showEmailForm) {
    setTimeout(() => {
      const container = document.getElementById('projectHomeDocuments');
      if (container) {
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      if (options.showEmailForm) {
        const form = container?.querySelector('.doc-form[data-doc-form="email"]');
        if (form) {
          form.classList.remove('hidden');
          form.querySelector('[data-email-field="subject"]')?.focus();
        }
      }
    }, 0);
  }
}

function closeProjectHome() {
  currentView = lastNonProjectView || 'all';
  currentProjectId = null;
  selectedProjectId = null;
  updateViewTitle();
  render();
}

function getQuickActionProject() {
  if (currentView === 'project' && currentProjectId) {
    return state.projects.find(p => p.id === currentProjectId) || null;
  }
  return null;
}

function updateQuickActions() {
  const quickActions = document.getElementById('quickActions');
  const titleEl = document.getElementById('quickActionsProject');
  if (!quickActions || !titleEl) return;

  const project = getQuickActionProject();
  if (!project) {
    quickActions.classList.remove('active');
    titleEl.textContent = 'No project selected';
    return;
  }

  quickActions.classList.add('active');
  titleEl.textContent = project.title || 'Selected project';
  const isArchived = project.archived;
  document.getElementById('qaQuickEdit').disabled = isArchived;
  document.getElementById('qaAddTask').disabled = isArchived;
  document.getElementById('qaAddEmail').disabled = isArchived;
  document.getElementById('qaAddDocx').disabled = isArchived;
  document.getElementById('qaMarkDone').disabled = isArchived;
}


function saveProjectEdits(projectId) {
  const existingProject = state.projects.find(p => p.id === projectId);
  if (existingProject?.archived) {
    showToast('Project is archived. Restore it to make changes.', 'info');
    return;
  }
  const title = document.getElementById('editTitle')?.value;
  const stakeholder = document.getElementById('editStakeholder')?.value?.trim() || '';
  const description = document.getElementById('editDescription')?.value;
  const status = document.getElementById('editStatus')?.value;

  if (existingProject && status !== existingProject.status) {
    const wipCheck = canAssignProjectToStatus(status, projectId);
    if (!wipCheck.allowed) {
      showToast(`WIP limit reached for ${status} (${wipCheck.count}/${wipCheck.limit})`, 'error');
      document.getElementById('editStatus').value = existingProject.status;
      updatePriorityControls('editStatus', 'editPriority', 'editPriorityGroup');
      return;
    }
  }

  updatePriorityControls('editStatus', 'editPriority', 'editPriorityGroup');
  const selectedPriority = document.getElementById('editPriority')?.value || 'none';
  const priority = status === 'backlog' ? 'none' : selectedPriority;
  const dueDate = document.getElementById('editDueDate')?.value || null;
  const tagsStr = document.getElementById('editTags')?.value || '';
  const tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean);

  var prevStatus = existingProject ? existingProject.status : status;
  updateProject(projectId, { title, stakeholder, description, status, priority, dueDate, tags });
  document.getElementById('projectModalTitle').textContent = title;
  setRenderHint({ type: 'project-update', projectId, prevStatus: prevStatus });
  render();
}

async function updateProjectHomeField(projectId, field, rawValue) {
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return;
  if (project.archived) {
    showToast('Project is archived. Restore it to make changes.', 'info');
    return;
  }

  const updates = {};
  if (field === 'title') {
    const title = (rawValue || '').trim();
    if (!title) {
      showToast('Project title is required', 'error');
      render();
      return;
    }
    updates.title = title;
  }
  if (field === 'stakeholder') {
    updates.stakeholder = (rawValue || '').trim();
  }
  if (field === 'description') {
    updates.description = rawValue || '';
  }
  if (field === 'dueDate') {
    updates.dueDate = rawValue || null;
  }
  if (field === 'tags') {
    updates.tags = (rawValue || '').split(',').map(t => t.trim()).filter(Boolean);
  }
  if (field === 'status') {
    const status = rawValue || project.status;
    if (status !== project.status) {
      const wipCheck = canAssignProjectToStatus(status, projectId);
      if (!wipCheck.allowed) {
        showToast(`WIP limit reached for ${status} (${wipCheck.count}/${wipCheck.limit})`, 'error');
        render();
        return;
      }
    }
    updates.status = status;
    if (status === 'backlog') {
      updates.priority = 'none';
    }
  }
  if (field === 'priority') {
    const status = project.status;
    if (status === 'backlog') {
      updates.priority = 'none';
    } else {
      updates.priority = rawValue || 'none';
    }
  }

  if (Object.keys(updates).length === 0) return;

  await updateProject(projectId, updates);
  updateViewTitle();
  render();
}
