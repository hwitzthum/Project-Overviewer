// Project Overviewer — Task CRUD
const documentPreviewCache = new Map();

function mapTasksById(tasks, taskId, updater) {
  return (tasks || []).map(task => {
    if (task.id === taskId) {
      return updater(task);
    }
    if (task.subtasks && task.subtasks.length > 0) {
      const nextSubtasks = mapTasksById(task.subtasks, taskId, updater);
      if (nextSubtasks !== task.subtasks) {
        return { ...task, subtasks: nextSubtasks };
      }
    }
    return task;
  });
}

function removeTaskById(tasks, taskId) {
  var changed = false;
  var nextTasks = [];

  for (var i = 0; i < (tasks || []).length; i++) {
    var task = tasks[i];
    if (task.id === taskId) {
      changed = true;
      continue;
    }

    if (task.subtasks && task.subtasks.length > 0) {
      var nextSubtasks = removeTaskById(task.subtasks, taskId);
      if (nextSubtasks !== task.subtasks) {
        changed = true;
        task = { ...task, subtasks: nextSubtasks };
      }
    }

    nextTasks.push(task);
  }

  return changed ? nextTasks : tasks;
}

async function addTask(projectId, title) {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return;
  if (!ensureNotArchived(projectId)) return;
  try {
    const task = {
      id: uuid(),
      title: trimmedTitle,
      completed: false,
      dueDate: null,
      notes: '',
      priority: 'none',
      recurring: null,
      blockedBy: null
    };

    const created = await API.createTask(projectId, task);
    const createdTask = {
      ...task,
      id: created?.id || task.id
    };

    // Append locally to avoid stale overwrite races from concurrent add requests.
    setState(s => ({
      projects: s.projects.map(p => p.id === projectId
        ? { ...p, tasks: [...(p.tasks || []), createdTask] }
        : p)
    }));

    setRenderHint({ type: 'project-update', projectId });
    render();
    if (currentEditingProject === projectId) {
      refreshProjectModalTasks(projectId);
    }

    // Re-focus the task input so user can add more tasks
    setTimeout(() => {
      const input = document.querySelector(`.task-add-input[data-project-id="${projectId}"]`);
      if (input) input.focus();
    }, 50);
  } catch (error) {
    console.error('Failed to add task:', error);
    showToast('Failed to add task', 'error');
  }
}

async function addSubtask(projectId, parentTaskId, title) {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return;
  if (!ensureNotArchived(projectId)) return;
  try {
    const task = {
      title: trimmedTitle,
      completed: false,
      parentTaskId: parentTaskId
    };

    const created = await API.createTask(projectId, task);
    const createdSubtask = {
      id: created?.id || uuid(),
      title: trimmedTitle,
      completed: false,
      dueDate: null,
      notes: '',
      priority: 'none',
      recurring: null,
      blockedBy: null,
      parentTaskId: parentTaskId,
      subtasks: []
    };

    // Append subtask to parent's subtasks array in local state
    setState(s => ({
      projects: s.projects.map(p => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          tasks: (p.tasks || []).map(t => {
            if (t.id !== parentTaskId) return t;
            return { ...t, subtasks: [...(t.subtasks || []), createdSubtask] };
          })
        };
      })
    }));

    setRenderHint({ type: 'project-update', projectId });
    render();
    if (currentEditingProject === projectId) {
      refreshProjectModalTasks(projectId);
    }

    // Re-focus the subtask input
    setTimeout(() => {
      const input = document.querySelector(`.subtask-add-input[data-parent-task-id="${parentTaskId}"]`);
      if (input) input.focus();
    }, 50);
  } catch (error) {
    console.error('Failed to add subtask:', error);
    showToast(error.message || 'Failed to add subtask', 'error');
  }
}

function focusTaskAddInput(projectId) {
  const modalInput = document.querySelector(`.modal-task-add-input[data-project-id="${projectId}"]`);
  if (modalInput) {
    modalInput.focus();
    return true;
  }
  const cardInput = document.querySelector(`.task-add-input[data-project-id="${projectId}"]`);
  if (cardInput) {
    cardInput.focus();
    return true;
  }
  return false;
}

async function toggleTask(projectId, taskId) {
  try {
    if (!ensureNotArchived(projectId)) return;
    const project = state.projects.find(p => p.id === projectId);
    if (!project) return;

    const task = findTaskInProject(project, taskId);
    if (!task) return;

    const completed = !task.completed;

    // Update task via API
    await API.updateTask(taskId, { completed });

    // Handle recurring tasks
    if (completed && task.recurring) {
      setTimeout(() => createRecurringTask(projectId, task), 500);
    }

    // Update locally (no need to re-fetch the entire project)
    setState(s => ({
      projects: s.projects.map(p => p.id === projectId
        ? { ...p, tasks: mapTasksById(p.tasks, taskId, t => ({ ...t, completed })) }
        : p)
    }));
    setRenderHint({ type: 'project-update', projectId });
    render();
    if (currentEditingProject === projectId) {
      refreshProjectModalTasks(projectId);
    }
  } catch (error) {
    console.error('Failed to toggle task:', error);
    showToast('Failed to update task', 'error');
  }
}

async function updateTaskFields(projectId, taskId, updates) {
  if (!ensureNotArchived(projectId)) return;
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return;

  const existing = findTaskInProject(project, taskId);
  if (!existing) return;

  const normalizedUpdates = { ...updates };
  if (normalizedUpdates.dueDate === '') {
    normalizedUpdates.dueDate = null;
  }
  if (normalizedUpdates.blockedBy !== undefined) {
    const trimmed = String(normalizedUpdates.blockedBy || '').trim();
    if (trimmed === taskId) {
      showToast('Task cannot block itself', 'error');
      if (currentEditingProject === projectId) {
        refreshProjectModalTasks(projectId);
      }
      return;
    }
    normalizedUpdates.blockedBy = trimmed || null;
  }
  if (normalizedUpdates.title !== undefined && !normalizedUpdates.title.trim()) {
    showToast('Task title is required', 'error');
    if (currentEditingProject === projectId) {
      refreshProjectModalTasks(projectId);
    }
    return;
  }

  const hasChanges = Object.keys(normalizedUpdates).some(key => existing[key] !== normalizedUpdates[key]);
  if (!hasChanges) return;

  try {
    await API.updateTask(taskId, normalizedUpdates);
    setState(s => ({
      projects: s.projects.map(p => p.id === projectId
        ? { ...p, tasks: mapTasksById(p.tasks, taskId, t => ({ ...t, ...normalizedUpdates })) }
        : p)
    }));
    setRenderHint({ type: 'project-update', projectId });
    render();
    if (currentEditingProject === projectId) {
      refreshProjectModalTasks(projectId);
    }
  } catch (error) {
    console.error('Failed to update task:', error);
    showToast('Failed to update task', 'error');
  }
}

async function deleteTask(projectId, taskId) {
  if (!ensureNotArchived(projectId)) return;
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return;

  const task = findTaskInProject(project, taskId);
  if (!task) return;

  showConfirmModal(`Delete "${task.title}"?`, 'This cannot be undone.', async () => {
    try {
      await API.deleteTask(taskId);
      setState(s => ({
        projects: s.projects.map(p => p.id === projectId
          ? { ...p, tasks: removeTaskById(p.tasks, taskId) }
          : p)
      }));
      setRenderHint({ type: 'project-update', projectId });
      render();
      if (currentEditingProject === projectId) {
        refreshProjectModalTasks(projectId);
      }
    } catch (error) {
      console.error('Failed to delete task:', error);
      showToast('Failed to delete task', 'error');
    }
  });
}

async function applyTaskOrder(projectId, orderedTasks) {
  if (!ensureNotArchived(projectId)) return;
  setState(s => ({
    projects: s.projects.map(p => p.id === projectId ? { ...p, tasks: orderedTasks } : p)
  }));
  render();
  if (currentEditingProject === projectId) {
    refreshProjectModalTasks(projectId);
  }

  try {
    const orders = orderedTasks.map((task, index) => ({ id: task.id, order: index }));
    await API.reorderTasks(projectId, orders);
  } catch (error) {
    console.error('Failed to reorder tasks:', error);
    showToast('Failed to reorder tasks', 'error');
    try {
      const refreshed = await API.getProject(projectId);
      setState(s => ({
        projects: s.projects.map(p => p.id === projectId ? refreshed : p)
      }));
      render();
      if (currentEditingProject === projectId) {
        refreshProjectModalTasks(projectId);
      }
    } catch (refreshError) {
      console.error('Failed to refresh project after reorder error:', refreshError);
    }
  }
}

function moveTask(projectId, taskId, direction) {
  if (!ensureNotArchived(projectId)) return;
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return;

  const tasks = [...(project.tasks || [])];
  const index = tasks.findIndex(t => t.id === taskId);
  if (index === -1) return;

  const nextIndex = direction === 'up' ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= tasks.length) return;

  const [moved] = tasks.splice(index, 1);
  tasks.splice(nextIndex, 0, moved);
  applyTaskOrder(projectId, tasks);
}

async function createRecurringTask(projectId, originalTask) {
  let nextDate = new Date(originalTask.dueDate || new Date());

  switch (originalTask.recurring) {
    case 'daily':
      nextDate.setDate(nextDate.getDate() + 1);
      break;
    case 'weekly':
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case 'monthly':
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
  }

  try {
    const created = await API.createTask(projectId, {
      title: originalTask.title,
      completed: false,
      dueDate: nextDate.toISOString().split('T')[0],
      notes: originalTask.notes || '',
      priority: originalTask.priority || 'none',
      recurring: originalTask.recurring || null,
      blockedBy: null
    });

    if (created) {
      const createdTask = {
        id: created?.id || uuid(),
        title: originalTask.title,
        completed: false,
        dueDate: nextDate.toISOString().split('T')[0],
        notes: originalTask.notes || '',
        priority: originalTask.priority || 'none',
        recurring: originalTask.recurring || null,
        blockedBy: null,
        parentTaskId: null,
        subtasks: []
      };
      setState(s => ({
        projects: s.projects.map(p => p.id === projectId
          ? { ...p, tasks: [...(p.tasks || []), createdTask] }
          : p)
      }));
      render();
      if (currentEditingProject === projectId) {
        refreshProjectModalTasks(projectId);
      }
    }
  } catch (error) {
    console.error('Failed to create recurring task:', error);
  }
}

async function refreshProjectDocuments(projectId) {
  try {
    const documents = await API.getProjectDocuments(projectId);
    setState(s => ({
      projects: s.projects.map(p => p.id === projectId ? { ...p, documents } : p)
    }));
    render();
    if (currentEditingProject === projectId) {
      refreshProjectModalDocuments(projectId);
    }
  } catch (error) {
    console.error('Failed to refresh documents:', error);
    showToast('Failed to load documents', 'error');
  }
}

function closeAllDocumentPreviews(container) {
  container.querySelectorAll('[data-doc-preview]').forEach(preview => {
    preview.classList.add('hidden');
  });
  container.querySelectorAll('[data-doc-action="open"]').forEach(button => {
    button.textContent = 'Open';
  });
}

function renderDocumentPreviewContent(preview) {
  if (preview.previewType === 'text') {
    return `
      <div class="doc-preview-toolbar">
        <span class="doc-preview-badge">Inline preview</span>
      </div>
      <pre class="doc-preview-text">${escapeHtml(preview.text || 'No preview available.')}</pre>
    `;
  }

  if (preview.previewType === 'pdf') {
    return `
      <div class="doc-preview-toolbar">
        <span class="doc-preview-badge">PDF preview</span>
        <a class="btn btn-secondary btn-sm" href="${escapeAttribute(sanitizeUrl(preview.inlineUrl))}" target="_blank" rel="noopener noreferrer">Open in tab</a>
      </div>
      <iframe
        class="doc-preview-frame"
        src="${escapeAttribute(sanitizeUrl(preview.inlineUrl))}"
        sandbox="allow-downloads"
        title="${escapeAttribute(preview.title || preview.fileName || 'Document preview')}"></iframe>
    `;
  }

  return `
    <div class="doc-preview-empty">
      <div>${escapeHtml(preview.message || 'Preview is not available for this document.')}</div>
      ${preview.downloadUrl
        ? `<a class="btn btn-secondary btn-sm" href="${escapeAttribute(sanitizeUrl(preview.downloadUrl))}">Download document</a>`
        : ''}
    </div>
  `;
}

async function toggleDocumentPreview(container, projectId, docId) {
  const previewEl = container.querySelector(`[data-doc-preview="${docId}"]`);
  const toggleButton = container.querySelector(`[data-doc-action="open"][data-doc-id="${docId}"]`);
  if (!previewEl || !toggleButton) return;

  const isOpen = !previewEl.classList.contains('hidden');
  if (isOpen) {
    previewEl.classList.add('hidden');
    toggleButton.textContent = 'Open';
    return;
  }

  closeAllDocumentPreviews(container);
  previewEl.classList.remove('hidden');
  toggleButton.textContent = 'Close';

  const project = state.projects.find(p => p.id === projectId);
  const document = project?.documents?.find(doc => doc.id === docId);
  if (!document || document.type === 'email') {
    return;
  }

  const loadingEl = previewEl.querySelector(`[data-doc-preview-loading="${docId}"]`);
  const bodyEl = previewEl.querySelector(`[data-doc-preview-body="${docId}"]`);
  if (!loadingEl || !bodyEl) return;

  if (documentPreviewCache.has(docId)) {
    // Re-render from cached data (not cached HTML) to ensure escaping is always applied
    bodyEl.innerHTML = renderDocumentPreviewContent(documentPreviewCache.get(docId));
    return;
  }

  loadingEl.classList.remove('hidden');
  bodyEl.innerHTML = '';

  try {
    const preview = await API.getDocumentPreview(docId);
    // Cache raw preview data, not rendered HTML — re-render on each hit
    if (documentPreviewCache.size >= 50) {
      documentPreviewCache.delete(documentPreviewCache.keys().next().value);
    }
    documentPreviewCache.set(docId, preview);
    if (!previewEl.isConnected) return;
    // renderDocumentPreviewContent applies escapeHtml to all user content
    bodyEl.innerHTML = renderDocumentPreviewContent(preview);
  } catch (error) {
    console.error('Failed to preview document:', error);
    if (!previewEl.isConnected) return;
    bodyEl.innerHTML = `
      <div class="doc-preview-empty">
        <div>Failed to load preview.</div>
        <a class="btn btn-secondary btn-sm" href="${escapeAttribute(buildApiPath(`/api/documents/${docId}/download`))}">Download document</a>
      </div>
    `;
    showToast('Failed to load document preview', 'error');
  } finally {
    if (loadingEl.isConnected) {
      loadingEl.classList.add('hidden');
    }
  }
}

async function addEmailDocument(projectId, email) {
  if (!ensureNotArchived(projectId)) return;
  const payload = {
    type: 'email',
    title: email.subject || 'Email',
    email
  };

  try {
    await API.createDocument(projectId, payload);
    await refreshProjectDocuments(projectId);
    showToast('Email added', 'success');
  } catch (error) {
    console.error('Failed to add email document:', error);
    showToast('Failed to add email', 'error');
  }
}

async function addDocxDocument(projectId, file, contentBase64) {
  if (!ensureNotArchived(projectId)) return;
  const payload = {
    type: 'docx',
    title: file.name,
    fileName: file.name,
    mimeType: file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    contentBase64
  };

  try {
    await API.createDocument(projectId, payload);
    await refreshProjectDocuments(projectId);
    showToast('Document added', 'success');
  } catch (error) {
    console.error('Failed to add document:', error);
    showToast('Failed to add document', 'error');
  }
}

function handleDocxFileUpload(projectId, file, inputEl) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.docx')) {
    showToast('Please select a .docx file', 'error');
    if (inputEl) inputEl.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = async () => {
    const result = reader.result || '';
    const base64 = String(result).split(',')[1] || '';
    if (!base64) {
      showToast('Failed to read file', 'error');
      if (inputEl) inputEl.value = '';
      return;
    }
    await addDocxDocument(projectId, file, base64);
    if (inputEl) inputEl.value = '';
  };
  reader.onerror = () => {
    showToast('Failed to read file', 'error');
    if (inputEl) inputEl.value = '';
  };
  reader.readAsDataURL(file);
}
