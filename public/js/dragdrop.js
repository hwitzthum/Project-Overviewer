// Project Overviewer — Drag and Drop
var draggedElement = null;
var draggedProjectId = null;
var draggedTaskId = null;
var draggedTaskProjectId = null;
var draggedHomeTaskId = null;
var draggedHomeProjectId = null;

function initDragDrop() {
  document.addEventListener('dragstart', e => {
    const taskItem = e.target.closest('.task-item');
    if (taskItem && taskItem.dataset.taskId) {
      draggedTaskId = taskItem.dataset.taskId;
      draggedTaskProjectId = taskItem.dataset.projectId;
      taskItem.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
      }
      return;
    }

    const card = e.target.closest('.project-card');
    if (card && !card.classList.contains('archived')) {
      draggedElement = card;
      draggedProjectId = card.dataset.id;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      if (currentView === 'kanban') {
        document.body.classList.add('kanban-dragging');
      }
    }
  });

  document.addEventListener('dragend', e => {
    if (draggedTaskId) {
      document.querySelectorAll('.task-item.dragging').forEach(el => el.classList.remove('dragging'));
      document.querySelectorAll('.task-item.drop-zone').forEach(el => el.classList.remove('drop-zone'));
      draggedTaskId = null;
      draggedTaskProjectId = null;
    }

    if (draggedElement) {
      draggedElement.classList.remove('dragging');
      draggedElement = null;
      draggedProjectId = null;
      document.body.classList.remove('kanban-dragging');
      document.querySelectorAll('.drop-zone').forEach(el => el.classList.remove('drop-zone'));
    }
  });

  document.addEventListener('dragover', e => {
    e.preventDefault();
    if (draggedTaskId) {
      const taskItem = e.target.closest('.task-item');
      if (taskItem && taskItem.dataset.projectId === draggedTaskProjectId) {
        taskItem.classList.add('drop-zone');
      }
      return;
    }
    if (!draggedProjectId) return;

    if (currentView === 'kanban') {
      const lane = e.target.closest('.kanban-lane');
      if (lane) {
        lane.classList.add('drop-zone');
      }
      return;
    }

    const card = e.target.closest('.project-card');
    if (card && card !== draggedElement) {
      card.classList.add('drop-zone');
    }
  });

  document.addEventListener('dragleave', e => {
    const taskItem = e.target.closest('.task-item');
    if (taskItem) {
      taskItem.classList.remove('drop-zone');
    }

    if (currentView === 'kanban') {
      const lane = e.target.closest('.kanban-lane');
      if (lane) {
        lane.classList.remove('drop-zone');
      }
      return;
    }

    const card = e.target.closest('.project-card');
    if (card) {
      card.classList.remove('drop-zone');
    }
  });

  document.addEventListener('drop', async e => {
    e.preventDefault();

    if (draggedTaskId) {
      const targetItem = e.target.closest('.task-item');
      if (targetItem && targetItem.dataset.projectId === draggedTaskProjectId) {
        const projectId = targetItem.dataset.projectId;
        const targetTaskId = targetItem.dataset.taskId;
        if (projectId && targetTaskId && targetTaskId !== draggedTaskId) {
          const project = state.projects.find(p => p.id === projectId);
          if (project) {
            const tasks = [...(project.tasks || [])];
            const fromIndex = tasks.findIndex(t => t.id === draggedTaskId);
            const toIndex = tasks.findIndex(t => t.id === targetTaskId);
            if (fromIndex !== -1 && toIndex !== -1) {
              const [moved] = tasks.splice(fromIndex, 1);
              tasks.splice(toIndex, 0, moved);
              applyTaskOrder(projectId, tasks);
            }
          }
        }
      }
      document.querySelectorAll('.task-item.drop-zone').forEach(el => el.classList.remove('drop-zone'));
      return;
    }

    if (currentView === 'kanban') {
      const targetLane = e.target.closest('.kanban-lane');
      if (targetLane && draggedProjectId) {
        const nextStatus = targetLane.dataset.status;
        const project = state.projects.find(p => p.id === draggedProjectId);
        if (project && nextStatus && project.status !== nextStatus) {
          const updates = nextStatus === 'backlog'
            ? { status: nextStatus, priority: 'none' }
            : { status: nextStatus };
          await applyProjectQuickUpdate(draggedProjectId, updates, 'Status updated');
        }
      }
      document.querySelectorAll('.drop-zone').forEach(el => el.classList.remove('drop-zone'));
      return;
    }

    const targetCard = e.target.closest('.project-card');
    if (targetCard && draggedProjectId && targetCard.dataset.id !== draggedProjectId) {
      const targetId = targetCard.dataset.id;
      const projects = [...state.projects];
      const draggedIndex = projects.findIndex(p => p.id === draggedProjectId);
      const targetIndex = projects.findIndex(p => p.id === targetId);

      if (draggedIndex !== -1 && targetIndex !== -1) {
        const [removed] = projects.splice(draggedIndex, 1);
        projects.splice(targetIndex, 0, removed);

        // Update orders and save to API
        const projectOrders = projects.map((p, index) => ({
          id: p.id,
          order: index
        }));

        try {
          await API.reorderProjects(projectOrders);
          setState({ projects });
          render();
        } catch (error) {
          console.error('Failed to reorder projects:', error);
          showToast('Failed to reorder projects', 'error');
        }
      }
    }
    document.querySelectorAll('.drop-zone').forEach(el => el.classList.remove('drop-zone'));
  });
}