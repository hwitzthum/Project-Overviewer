// Project Overviewer — Project CRUD

function updatePriorityControls(statusSelectId, prioritySelectId, priorityGroupId) {
  const statusEl = document.getElementById(statusSelectId);
  const priorityEl = document.getElementById(prioritySelectId);
  const priorityGroupEl = document.getElementById(priorityGroupId);
  if (!statusEl || !priorityEl || !priorityGroupEl) return;

  const isBacklog = statusEl.value === 'backlog';
  if (isBacklog) {
    priorityEl.value = 'none';
  }

  priorityEl.disabled = isBacklog;
  priorityGroupEl.style.display = isBacklog ? 'none' : '';
}

function createProject() {
  openCreateProjectModal();
}

function openCreateProjectModal() {
  document.getElementById('createTitle').value = '';
  document.getElementById('createStakeholder').value = '';
  document.getElementById('createDescription').value = '';
  document.getElementById('createStatus').value = 'not-started';
  document.getElementById('createPriority').value = 'medium';
  document.getElementById('createDueDate').value = '';
  document.getElementById('createTags').value = '';
  updatePriorityControls('createStatus', 'createPriority', 'createPriorityGroup');
  openModal('createProjectModal');
  setTimeout(() => document.getElementById('createTitle')?.focus(), 0);
}

async function submitCreateProject() {
  const title = document.getElementById('createTitle')?.value?.trim();
  const stakeholder = document.getElementById('createStakeholder')?.value?.trim() || '';
  const description = document.getElementById('createDescription')?.value?.trim() || '';
  const status = document.getElementById('createStatus')?.value || 'not-started';
  const selectedPriority = document.getElementById('createPriority')?.value || 'none';
  const priority = status === 'backlog' ? 'none' : selectedPriority;
  const dueDate = document.getElementById('createDueDate')?.value || null;
  const tagsStr = document.getElementById('createTags')?.value || '';
  const tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean);
  const wipCheck = canAssignProjectToStatus(status);

  if (!title) {
    showToast('Project title is required', 'error');
    document.getElementById('createTitle')?.focus();
    return;
  }

  if (!wipCheck.allowed) {
    showToast(`WIP limit reached for ${status} (${wipCheck.count}/${wipCheck.limit})`, 'error');
    return;
  }

  try {
    const project = {
      id: uuid(),
      title,
      stakeholder,
      description,
      status,
      priority,
      dueDate,
      tasks: [],
      tags,
      order: state.projects.length,
      createdAt: new Date().toISOString()
    };

    const createdProject = await API.createProject(project);
    setState(s => ({ projects: [...s.projects, createdProject] }));
    closeModal('createProjectModal');
    render();
  } catch (error) {
    console.error('Failed to create project:', error);
    showToast('Failed to create project', 'error');
  }
}

async function deleteProject(id) {
  const project = state.projects.find(p => p.id === id);
  if (!project) return;

  showConfirmModal(`Delete "${project.title}"?`, 'This cannot be undone.', async () => {
    try {
      const projectSnapshot = await API.getProject(id, { includeDocumentContent: true }).catch(() => project);
      await API.deleteProject(id);
      setState(s => ({ projects: s.projects.filter(p => p.id !== id) }));
      closeModal('projectModal');
      if (currentView === 'project' && currentProjectId === id) {
        closeProjectHome();
      } else {
        render();
      }
      showToast(`Deleted "${project.title}"`, 'info', {
        actionLabel: 'Undo',
        duration: 8000,
        onAction: () => restoreDeletedProject(projectSnapshot)
      });
    } catch (error) {
      console.error('Failed to delete project:', error);
      showToast('Failed to delete project', 'error');
    }
  });
}