// Project Overviewer — Event Delegation
// These are attached ONCE to the content container and work for all dynamically created elements

function handleDocAction(container, action, projectId, docId) {
  if (action === 'show-email') {
    const form = container.querySelector('.doc-form[data-doc-form="email"]');
    if (form) {
      form.classList.remove('hidden');
      form.querySelector('[data-email-field="subject"]')?.focus();
    }
  }

  if (action === 'cancel-email') {
    const form = container.querySelector('.doc-form[data-doc-form="email"]');
    if (form) {
      form.classList.add('hidden');
      form.querySelectorAll('input, textarea').forEach(el => { el.value = ''; });
    }
  }

  if (action === 'save-email') {
    const form = container.querySelector('.doc-form[data-doc-form="email"]');
    if (!form || !projectId) return;
    const email = {
      subject: form.querySelector('[data-email-field="subject"]')?.value?.trim() || '',
      from: form.querySelector('[data-email-field="from"]')?.value?.trim() || '',
      to: form.querySelector('[data-email-field="to"]')?.value?.trim() || '',
      date: form.querySelector('[data-email-field="date"]')?.value || '',
      body: form.querySelector('[data-email-field="body"]')?.value?.trim() || ''
    };
    if (!email.subject && !email.body) {
      showToast('Add a subject or body for the email', 'error');
      return;
    }
    addEmailDocument(projectId, email);
    form.classList.add('hidden');
    form.querySelectorAll('input, textarea').forEach(el => { el.value = ''; });
  }

  if (action === 'toggle-email') {
    const body = container.querySelector(`[data-doc-body="${docId}"]`);
    if (body) body.classList.toggle('hidden');
  }

  if (action === 'delete') {
    showConfirmModal('Delete document?', 'This cannot be undone.', async () => {
      try {
        await API.deleteDocument(docId);
        await refreshProjectDocuments(projectId);
      } catch (error) {
        console.error('Failed to delete document:', error);
        showToast('Failed to delete document', 'error');
      }
    });
  }
}

function wireTaskDrag(container, getDragState, setDragState) {
  container.addEventListener('dragstart', e => {
    const item = e.target.closest('.modal-task-item');
    if (!item) return;
    setDragState(item.dataset.taskId, item.dataset.projectId);
    item.classList.add('dragging');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  });

  container.addEventListener('dragover', e => {
    const { taskId, projectId } = getDragState();
    if (!taskId) return;
    const item = e.target.closest('.modal-task-item');
    if (!item || item.dataset.projectId !== projectId) return;
    e.preventDefault();
    item.classList.add('drop-zone');
  });

  container.addEventListener('dragleave', e => {
    const item = e.target.closest('.modal-task-item');
    if (item) item.classList.remove('drop-zone');
  });

  container.addEventListener('drop', e => {
    const { taskId: dragId, projectId: dragProjectId } = getDragState();
    if (!dragId) return;
    const item = e.target.closest('.modal-task-item');
    if (!item || item.dataset.projectId !== dragProjectId) return;
    e.preventDefault();
    const projectId = item.dataset.projectId;
    const targetTaskId = item.dataset.taskId;
    if (!projectId || !targetTaskId || targetTaskId === dragId) return;

    const project = state.projects.find(p => p.id === projectId);
    if (!project) return;

    const tasks = [...(project.tasks || [])];
    const fromIndex = tasks.findIndex(t => t.id === dragId);
    const toIndex = tasks.findIndex(t => t.id === targetTaskId);
    if (fromIndex === -1 || toIndex === -1) return;

    const [moved] = tasks.splice(fromIndex, 1);
    tasks.splice(toIndex, 0, moved);
    applyTaskOrder(projectId, tasks);
    container.querySelectorAll('.modal-task-item.drop-zone').forEach(el => el.classList.remove('drop-zone'));
  });

  container.addEventListener('dragend', () => {
    const { taskId } = getDragState();
    if (!taskId) return;
    container.querySelectorAll('.modal-task-item.dragging').forEach(el => el.classList.remove('dragging'));
    container.querySelectorAll('.modal-task-item.drop-zone').forEach(el => el.classList.remove('drop-zone'));
    setDragState(null, null);
  });
}
function initEventDelegation() {
  const content = document.getElementById('content');

  // Project title editing - blur event
  content.addEventListener('blur', e => {
    if (e.target.classList.contains('project-title')) {
      const id = e.target.dataset.id;
      if (id && e.target.value.trim()) {
        updateProject(id, { title: e.target.value.trim() });
      }
    }

    if (e.target.classList.contains('quick-stakeholder')) {
      const projectId = e.target.dataset.projectId;
      const stakeholder = e.target.value.trim();
      applyProjectQuickUpdate(projectId, { stakeholder }, 'Stakeholder updated');
    }

    if (e.target.classList.contains('task-title-input')) {
      const projectId = e.target.dataset.projectId;
      const taskId = e.target.dataset.taskId;
      const project = state.projects.find(p => p.id === projectId);
      const task = project?.tasks?.find(t => t.id === taskId);
      const title = e.target.value.trim();
      if (!title) {
        e.target.value = task?.title || '';
        showToast('Task title is required', 'error');
        return;
      }
      updateTaskFields(projectId, taskId, { title });
    }

    if (e.target.classList.contains('project-home-field') && e.target.tagName !== 'SELECT') {
      const projectId = e.target.dataset.projectId;
      const field = e.target.dataset.field;
      updateProjectHomeField(projectId, field, e.target.value);
    }
  }, true); // Use capture phase for blur events

  // Project title editing - keydown event
  content.addEventListener('keydown', e => {
    if (e.target.classList.contains('project-title')) {
      if (e.key === 'Enter') {
        e.target.blur();
      }
    }

    if (e.target.classList.contains('quick-stakeholder') && e.key === 'Enter') {
      e.preventDefault();
      e.target.blur();
    }

    if (e.target.classList.contains('kanban-limit-input') && e.key === 'Enter') {
      e.preventDefault();
      e.target.blur();
    }

    // Task add input - keydown event
    if (e.target.classList.contains('task-add-input')) {
      if (e.key === 'Enter' && e.target.value.trim()) {
        addTask(e.target.dataset.projectId, e.target.value);
        e.target.value = '';
      }
    }

    if (e.target.classList.contains('modal-task-add-input')) {
      if (e.key === 'Enter' && e.target.value.trim()) {
        addTask(e.target.dataset.projectId, e.target.value);
        e.target.value = '';
      }
    }

    if (e.target.classList.contains('task-title-input') && e.key === 'Enter') {
      e.preventDefault();
      e.target.blur();
    }

    // Task checkbox - keydown event
    if (e.target.classList.contains('task-checkbox')) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const projectId = e.target.dataset.projectId;
        const taskId = e.target.dataset.taskId;
        toggleTask(projectId, taskId);
      }
    }
  });

  content.addEventListener('change', e => {
    if (e.target.classList.contains('quick-status')) {
      const projectId = e.target.dataset.projectId;
      const nextStatus = e.target.value;
      const updates = nextStatus === 'backlog'
        ? { status: nextStatus, priority: 'none' }
        : { status: nextStatus };
      applyProjectQuickUpdate(projectId, updates, 'Status updated');
      return;
    }

    if (e.target.classList.contains('quick-priority')) {
      const projectId = e.target.dataset.projectId;
      const priority = e.target.value;
      applyProjectQuickUpdate(projectId, { priority }, 'Priority updated');
      return;
    }

    if (e.target.classList.contains('kanban-limit-input')) {
      const status = e.target.dataset.laneLimitStatus;
      if (!status) return;
      const nextLimit = updateLaneWipLimit(status, e.target.value);
      const currentCount = getLaneProjectCount(status);
      e.target.value = nextLimit ?? '';
      render();
      if (nextLimit && currentCount > nextLimit) {
        showToast(`${status} is currently above the new WIP limit (${currentCount}/${nextLimit})`, 'info');
      }
    }

    if (e.target.classList.contains('docx-input')) {
      const projectId = e.target.dataset.projectId;
      const file = e.target.files && e.target.files[0];
      if (!projectId || !file) return;
      handleDocxFileUpload(projectId, file, e.target);
    }

    if (e.target.classList.contains('task-due-input')) {
      const projectId = e.target.dataset.projectId;
      const taskId = e.target.dataset.taskId;
      updateTaskFields(projectId, taskId, { dueDate: e.target.value || null });
    }

    if (e.target.classList.contains('project-home-field') && e.target.tagName === 'SELECT') {
      const projectId = e.target.dataset.projectId;
      const field = e.target.dataset.field;
      updateProjectHomeField(projectId, field, e.target.value);
    }
  });

  // Task checkboxes - click event
  content.addEventListener('click', e => {
    // Delete button on project card
    const deleteBtn = e.target.closest('.project-delete-btn');
    if (deleteBtn) {
      e.stopPropagation();
      const projectId = deleteBtn.dataset.id;
      deleteProject(projectId);
      return;
    }

    const checkbox = e.target.closest('.task-checkbox');
    if (checkbox) {
      const projectId = checkbox.dataset.projectId;
      const taskId = checkbox.dataset.taskId;
      toggleTask(projectId, taskId);
      return;
    }

    const openTaskProject = e.target.closest('.task-open-project');
    if (openTaskProject) {
      const projectId = openTaskProject.dataset.projectId;
      openProjectHome(projectId);
      return;
    }

    const docEmailBtn = e.target.closest('.doc-add-email');
    if (docEmailBtn) {
      const projectId = docEmailBtn.dataset.projectId;
      openProjectHome(projectId, { showEmailForm: true, scrollToDocuments: true });
      return;
    }

    const docManageBtn = e.target.closest('.doc-manage');
    if (docManageBtn) {
      const projectId = docManageBtn.dataset.projectId;
      openProjectHome(projectId, { scrollToDocuments: true });
      return;
    }

    // Task add area - click to focus input (FIX: clicking "+" or area should focus input)
    const taskAdd = e.target.closest('.task-add');
    if (taskAdd && !e.target.classList.contains('task-add-input')) {
      const input = taskAdd.querySelector('.task-add-input');
      if (input) {
        input.focus();
      }
      return;
    }

    const modalTaskDelete = e.target.closest('.modal-task-delete');
    if (modalTaskDelete) {
      deleteTask(modalTaskDelete.dataset.projectId, modalTaskDelete.dataset.taskId);
      return;
    }

    const modalTaskMove = e.target.closest('.modal-task-move');
    if (modalTaskMove) {
      moveTask(modalTaskMove.dataset.projectId, modalTaskMove.dataset.taskId, modalTaskMove.dataset.direction);
      return;
    }

    const docAction = e.target.closest('[data-doc-action]');
    if (docAction) {
      const action = docAction.dataset.docAction;
      const projectId = docAction.dataset.projectId || currentProjectId;
      const docId = docAction.dataset.docId;
      const container = docAction.closest('#projectHomeDocuments') || document;
      handleDocAction(container, action, projectId, docId);
      return;
    }

    const projectAction = e.target.closest('[data-project-action]');
    if (projectAction) {
      const action = projectAction.dataset.projectAction;
      const projectId = projectAction.dataset.projectId || currentProjectId;
      if (action === 'back') {
        closeProjectHome();
      }
      if (action === 'quick-edit' && projectId) {
        openProjectModal(projectId);
      }
      if (action === 'archive' && projectId) {
        archiveProject(projectId);
      }
      if (action === 'restore' && projectId) {
        restoreProject(projectId);
      }
      if (action === 'delete' && projectId) {
        deleteProject(projectId);
      }
      return;
    }

    const restoreBtn = e.target.closest('.project-restore-btn');
    if (restoreBtn) {
      const projectId = restoreBtn.dataset.projectId;
      restoreProject(projectId);
      return;
    }

    const card = e.target.closest('.project-card');
    if (card &&
      !e.target.closest('input') &&
      !e.target.closest('select') &&
      !e.target.closest('button') &&
      !e.target.closest('.task-checkbox') &&
      !e.target.closest('.doc-add') &&
      !e.target.closest('.task-drag-handle')) {
      openProjectHome(card.dataset.id);
      return;
    }
  });

  // Project card double-click (open modal)
  content.addEventListener('dblclick', e => {
    const card = e.target.closest('.project-card');
    if (card && !e.target.closest('input') && !e.target.closest('select') && !e.target.closest('.task-checkbox')) {
      openProjectModal(card.dataset.id);
    }
  });

  // Note: input click propagation is handled within the main click handler above
  // via the card click guard (checking for input/select/button ancestors)

  wireTaskDrag(content,
    () => ({ taskId: draggedHomeTaskId, projectId: draggedHomeProjectId }),
    (tid, pid) => { draggedHomeTaskId = tid; draggedHomeProjectId = pid; }
  );
}

function initProjectModalDelegation() {
  const modalBody = document.getElementById('projectModalBody');
  if (!modalBody) return;

  modalBody.addEventListener('keydown', e => {
    if (e.target.classList.contains('modal-task-add-input')) {
      if (e.key === 'Enter' && e.target.value.trim()) {
        const projectId = e.target.dataset.projectId;
        addTask(projectId, e.target.value);
        e.target.value = '';
        setTimeout(() => {
          const input = modalBody.querySelector(`.modal-task-add-input[data-project-id="${projectId}"]`);
          if (input) input.focus();
        }, 50);
      }
    }

    if (e.target.classList.contains('modal-task-title') && e.key === 'Enter') {
      e.preventDefault();
      e.target.blur();
    }

    if (e.target.classList.contains('task-checkbox')) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const projectId = e.target.dataset.projectId;
        const taskId = e.target.dataset.taskId;
        toggleTask(projectId, taskId);
      }
    }
  });

  modalBody.addEventListener('blur', e => {
    if (e.target.classList.contains('modal-task-title')) {
      const projectId = e.target.dataset.projectId;
      const taskId = e.target.dataset.taskId;
      updateTaskFields(projectId, taskId, { title: e.target.value.trim() });
    }

    if (e.target.classList.contains('task-blocked-by-input')) {
      const projectId = e.target.dataset.projectId;
      const taskId = e.target.dataset.taskId;
      updateTaskFields(projectId, taskId, { blockedBy: e.target.value });
    }
  }, true);

  modalBody.addEventListener('change', e => {
    if (e.target.classList.contains('modal-task-date')) {
      const projectId = e.target.dataset.projectId;
      const taskId = e.target.dataset.taskId;
      updateTaskFields(projectId, taskId, { dueDate: e.target.value || null });
    }

    if (e.target.classList.contains('docx-input')) {
      const projectId = e.target.dataset.projectId;
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      handleDocxFileUpload(projectId, file, e.target);
    }
  });

  modalBody.addEventListener('click', e => {
    const checkbox = e.target.closest('.task-checkbox');
    if (checkbox) {
      const projectId = checkbox.dataset.projectId;
      const taskId = checkbox.dataset.taskId;
      toggleTask(projectId, taskId);
      return;
    }

    const deleteBtn = e.target.closest('.modal-task-delete');
    if (deleteBtn) {
      deleteTask(deleteBtn.dataset.projectId, deleteBtn.dataset.taskId);
      return;
    }

    const moveBtn = e.target.closest('.modal-task-move');
    if (moveBtn) {
      moveTask(moveBtn.dataset.projectId, moveBtn.dataset.taskId, moveBtn.dataset.direction);
      return;
    }

    const docAction = e.target.closest('[data-doc-action]');
    if (docAction) {
      const action = docAction.dataset.docAction;
      const projectId = docAction.dataset.projectId;
      const docId = docAction.dataset.docId;
      handleDocAction(modalBody, action, projectId, docId);
    }
  });

  wireTaskDrag(modalBody,
    () => ({ taskId: draggedTaskId, projectId: draggedTaskProjectId }),
    (tid, pid) => { draggedTaskId = tid; draggedTaskProjectId = pid; }
  );
}

function initDependencyPicker() {
  function getPickerElements(input) {
    const picker = input.closest('.dependency-picker');
    const options = picker ? picker.querySelector('.dependency-options') : null;
    return { picker, options };
  }

  function closeAllDependencyOptions() {
    document.querySelectorAll('.dependency-options').forEach(el => el.classList.add('hidden'));
  }

  function renderDependencyOptions(input) {
    if (input.disabled) return;
    const taskId = input.dataset.taskId;
    const { options } = getPickerElements(input);
    if (!options || !taskId) return;

    const query = input.value.trim().toLowerCase();
    const candidates = getDependencyCandidates(taskId);
    const filtered = candidates.filter(entry => {
      const label = formatDependencyLabel(entry).toLowerCase();
      return !query || label.includes(query) || entry.task.id.toLowerCase().includes(query);
    });

    const items = filtered.slice(0, 8).map(entry => `
      <div class="dependency-option" data-task-id="${entry.task.id}">
        <div>${escapeHtml(entry.task.title)}</div>
        <div class="dependency-option-meta">${escapeHtml(entry.project.title)} · ${entry.task.id}</div>
      </div>
    `).join('');

    options.innerHTML = items || '<div class="empty-muted">No matches</div>';
    options.classList.remove('hidden');
  }

  function setDependencySelection(input, entry) {
    if (!entry) {
      input.value = '';
      input.dataset.blockedById = '';
      input.dataset.blockedByLabel = '';
      return;
    }
    const label = formatDependencyLabel(entry);
    input.value = label;
    input.dataset.blockedById = entry.task.id;
    input.dataset.blockedByLabel = label;
  }

  function resolveDependencyInput(input) {
    if (input.disabled) return;
    const projectId = input.dataset.projectId;
    const taskId = input.dataset.taskId;
    if (!projectId || !taskId) return;

    const currentId = input.dataset.blockedById || '';
    const currentLabel = input.dataset.blockedByLabel || '';
    const value = input.value.trim();

    if (!value) {
      if (currentId) {
        updateTaskFields(projectId, taskId, { blockedBy: null });
      }
      return;
    }

    if (value === currentLabel && currentId) return;

    const byId = findTaskEntryById(value);
    if (byId && byId.task.id !== taskId) {
      setDependencySelection(input, byId);
      if (byId.task.id !== currentId) {
        updateTaskFields(projectId, taskId, { blockedBy: byId.task.id });
      }
      return;
    }

    const candidates = getDependencyCandidates(taskId);
    const matches = candidates.filter(entry =>
      formatDependencyLabel(entry).toLowerCase() === value.toLowerCase()
    );
    if (matches.length === 1) {
      setDependencySelection(input, matches[0]);
      if (matches[0].task.id !== currentId) {
        updateTaskFields(projectId, taskId, { blockedBy: matches[0].task.id });
      }
      return;
    }

    input.value = currentLabel;
    showToast('Select a task from the list', 'info');
  }

  document.addEventListener('focusin', e => {
    if (!e.target.classList.contains('task-blocked-by-input')) return;
    renderDependencyOptions(e.target);
  });

  document.addEventListener('input', e => {
    if (!e.target.classList.contains('task-blocked-by-input')) return;
    renderDependencyOptions(e.target);
  });

  document.addEventListener('keydown', e => {
    if (!e.target.classList.contains('task-blocked-by-input')) return;
    if (e.key === 'Escape') {
      const { options } = getPickerElements(e.target);
      options?.classList.add('hidden');
    }
  });

  document.addEventListener('click', e => {
    const option = e.target.closest('.dependency-option');
    if (option) {
      const picker = option.closest('.dependency-picker');
      const input = picker?.querySelector('.task-blocked-by-input');
      if (!input) return;
      const entry = findTaskEntryById(option.dataset.taskId);
      if (entry) {
        setDependencySelection(input, entry);
        updateTaskFields(input.dataset.projectId, input.dataset.taskId, { blockedBy: entry.task.id });
      }
      const options = picker?.querySelector('.dependency-options');
      options?.classList.add('hidden');
      return;
    }

    const clearBtn = e.target.closest('.dependency-clear');
    if (clearBtn) {
      const picker = clearBtn.closest('.dependency-picker');
      const input = picker?.querySelector('.task-blocked-by-input');
      if (!input) return;
      setDependencySelection(input, null);
      updateTaskFields(input.dataset.projectId, input.dataset.taskId, { blockedBy: null });
      return;
    }

    if (!e.target.closest('.dependency-picker')) {
      closeAllDependencyOptions();
    }
  });

  document.addEventListener('blur', e => {
    if (!e.target.classList.contains('task-blocked-by-input')) return;
    const input = e.target;
    setTimeout(() => {
      resolveDependencyInput(input);
      const { options } = getPickerElements(input);
      options?.classList.add('hidden');
    }, 100);
  }, true);
}

// Legacy function for backwards compatibility - now a no-op since we use event delegation
function attachEventListeners() {
  // Event listeners are now attached via event delegation in initEventDelegation()
  // This function is kept for backwards compatibility but does nothing
}
