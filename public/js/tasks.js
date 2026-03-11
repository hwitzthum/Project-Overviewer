// Project Overviewer — Task CRUD
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

    const task = project.tasks.find(t => t.id === taskId);
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
        ? { ...p, tasks: p.tasks.map(t => t.id === taskId ? { ...t, completed } : t) }
        : p)
    }));
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

  const existing = project.tasks.find(t => t.id === taskId);
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
        ? { ...p, tasks: p.tasks.map(t => t.id === taskId ? { ...t, ...normalizedUpdates } : t) }
        : p)
    }));
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

  const task = project.tasks.find(t => t.id === taskId);
  if (!task) return;

  showConfirmModal(`Delete "${task.title}"?`, 'This cannot be undone.', async () => {
    try {
      await API.deleteTask(taskId);
      setState(s => ({
        projects: s.projects.map(p => p.id === projectId
          ? { ...p, tasks: p.tasks.filter(t => t.id !== taskId) }
          : p)
      }));
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
      setState(s => ({
        projects: s.projects.map(p => p.id === projectId
          ? { ...p, tasks: [...(p.tasks || []), created] }
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