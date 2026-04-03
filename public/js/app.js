// Project Overviewer — App Initialization
var notesSaveTimeout = null;

async function init() {
  // Load data from API
  await loadFromStorage();

  // Apply theme — prefer server-side theme from /api/auth/me, then local storage, then settings
  const serverTheme = window.__authenticatedUser?.theme;
  const bootThemePreference = getStoredThemePreference();
  const activeThemePreference = (serverTheme && serverTheme !== 'auto')
    ? serverTheme
    : (state.settings.theme && state.settings.theme !== 'auto')
      ? state.settings.theme
      : bootThemePreference;
  applyTheme(activeThemePreference, { persist: false });
  markThemeReady();

  // Apply sidebar state
  if (state.settings.sidebarCollapsed) {
    document.getElementById('sidebar').classList.add('collapsed');
  }

  // Load quick notes
  document.getElementById('notesTextarea').value = state.quickNotes || '';

  // Set current view
  currentView = state.settings.lastView || 'all';
  if (currentView === 'active') currentView = 'in-progress';
  lastNonProjectView = currentView;
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === currentView);
  });
  const sortSelect = document.getElementById('sortProjects');
  if (sortSelect) {
    sortSelect.value = state.settings.sortBy || 'manual';
  }
  updateViewTitle();

  // Initial render
  render();

  // Init subsystems
  initEventDelegation(); // Set up event delegation for dynamic content
  initProjectModalDelegation();
  initDependencyPicker();
  initDragDrop();
  initKeyboardShortcuts();

  // Sidebar toggle
  document.getElementById('toggleSidebar').addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
    setState(s => ({ settings: { ...s.settings, sidebarCollapsed: sidebar.classList.contains('collapsed') } }));
  });

  // Navigation
  var ALLOWED_STATIC_VIEWS = ['all', 'kanban', 'focus', 'active', 'not-started',
    'in-progress', 'backlog', 'completed', 'archived', 'overdue', 'today', 'week',
    'priority-high', 'priority-medium', 'priority-low',
    'smart-overdue', 'smart-due-soon', 'smart-waiting', 'project'];

  function isAllowedView(view) {
    if (!view) return false;
    if (ALLOWED_STATIC_VIEWS.indexOf(view) !== -1) return true;
    if (/^tag-.{1,64}$/.test(view)) return true;
    if (/^stakeholder-.{1,100}$/.test(view)) return true;
    return false;
  }

  document.querySelector('.sidebar-nav').addEventListener('click', e => {
    const navItem = e.target.closest('.nav-item');
    if (navItem && navItem.dataset.view && isAllowedView(navItem.dataset.view)) {
      document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
      navItem.classList.add('active');
      currentView = navItem.dataset.view;
      if (currentView !== 'project') {
        lastNonProjectView = currentView;
        currentProjectId = null;
        selectedProjectId = null;
      }
      setState(s => ({ settings: { ...s.settings, lastView: currentView } }));
      updateViewTitle();
      render();
    }
  });

  // Search
  document.getElementById('searchInput').addEventListener('input', e => {
    searchQuery = e.target.value;
    render();
  });

  document.getElementById('sortProjects').addEventListener('change', e => {
    const sortBy = e.target.value;
    setState(s => ({ settings: { ...s.settings, sortBy } }));
    render();
  });

  // New project button
  document.getElementById('newProject').addEventListener('click', createProject);
  document.getElementById('createProjectSubmit').addEventListener('click', submitCreateProject);
  document.getElementById('createStatus').addEventListener('change', () => {
    updatePriorityControls('createStatus', 'createPriority', 'createPriorityGroup');
  });
  document.getElementById('createProjectModal').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      submitCreateProject();
    }
  });

  // Settings
  document.getElementById('openSettings').addEventListener('click', () => openModal('settingsModal'));

  // Quick actions
  document.getElementById('qaOpenProject').addEventListener('click', () => {
    const project = getQuickActionProject();
    if (project) openProjectHome(project.id);
  });
  document.getElementById('qaQuickEdit').addEventListener('click', () => {
    const project = getQuickActionProject();
    if (project) openProjectModal(project.id);
  });
  document.getElementById('qaAddTask').addEventListener('click', () => {
    const project = getQuickActionProject();
    if (!project) return;
    if (!focusTaskAddInput(project.id)) {
      openProjectHome(project.id);
      setTimeout(() => focusTaskAddInput(project.id), 50);
    }
  });
  document.getElementById('qaAddEmail').addEventListener('click', () => {
    const project = getQuickActionProject();
    if (project) openProjectHome(project.id, { showEmailForm: true, scrollToDocuments: true });
  });
  document.getElementById('qaAddDocx').addEventListener('click', () => {
    const project = getQuickActionProject();
    if (!project) return;
    quickActionDocxProjectId = project.id;
    document.getElementById('quickActionDocxInput').click();
  });
  document.getElementById('qaMarkDone').addEventListener('click', () => {
    const project = getQuickActionProject();
    if (project) {
      applyProjectQuickUpdate(project.id, { status: 'completed' }, 'Project completed');
    }
  });
  document.getElementById('quickActionDocxInput').addEventListener('change', e => {
    const projectId = quickActionDocxProjectId;
    const file = e.target.files && e.target.files[0];
    if (!projectId || !file) return;
    handleDocxFileUpload(projectId, file, e.target);
    quickActionDocxProjectId = null;
  });

  // Theme options (scoped to settings modal only, not all [data-theme] elements)
  document.querySelectorAll('#settingsModal .settings-option[data-theme]').forEach(option => {
    option.addEventListener('click', () => {
      const theme = option.dataset.theme;
      setState(s => ({ settings: { ...s.settings, theme } }));
      applyTheme(theme);
    });
  });

  // Export/Import
  document.getElementById('exportData').addEventListener('click', exportData);
  document.getElementById('importData').addEventListener('click', () => document.getElementById('fileInput').click());
  document.getElementById('fileInput').addEventListener('change', e => {
    if (e.target.files[0]) importData(e.target.files[0]);
  });

  // Statistics button
  document.getElementById('showStats').addEventListener('click', renderStatistics);

  // Focus mode
  document.getElementById('toggleFocus').addEventListener('click', toggleFocusMode);

  // Delete project
  document.getElementById('deleteProject').addEventListener('click', () => {
    if (currentEditingProject) deleteProject(currentEditingProject);
  });

  // Modal close buttons
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', e => {
      const overlay = e.target.closest('.modal-overlay');
      if (overlay) closeModal(overlay.id);
    });
  });

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // Quick notes
  document.getElementById('closeNotes').addEventListener('click', () => {
    document.getElementById('quickNotes').classList.remove('active');
  });
  document.getElementById('notesTextarea').addEventListener('input', e => {
    state.quickNotes = e.target.value;
    clearTimeout(notesSaveTimeout);
    notesSaveTimeout = setTimeout(async () => {
      try {
        await API.saveQuickNotes(state.quickNotes);
      } catch (error) {
        console.error('Failed to save notes:', error);
      }
    }, 1000);
  });
  document.getElementById('convertToTask').addEventListener('click', () => {
    const notes = document.getElementById('notesTextarea').value.trim();
    if (!notes) {
      showToast('No notes to convert', 'error');
      return;
    }
    // Prefer the currently open project, then the first non-archived personal project
    const targetProject = (currentProjectId && state.projects.find(p => p.id === currentProjectId && !p.archived))
      || state.projects.find(p => !p.archived && (!currentWorkspaceMode || currentWorkspaceMode === 'personal' || p.user_id === currentUserId));
    if (!targetProject) {
      showToast('Create a project first', 'error');
      return;
    }
    addTask(targetProject.id, notes);
    document.getElementById('notesTextarea').value = '';
    setState({ quickNotes: '' });
    document.getElementById('quickNotes').classList.remove('active');
    showToast(`Note added to "${targetProject.title}"`, 'success');
  });

  // Command palette input
  document.getElementById('commandInput').addEventListener('input', e => {
    selectedCommandIndex = 0;
    renderCommands(e.target.value);
  });

  // Close command palette on outside click
  document.getElementById('commandPalette').addEventListener('click', e => {
    if (e.target.id === 'commandPalette') closeCommandPalette();
  });

  // Listen for system theme changes (use AbortController to prevent duplicate listeners)
  if (window.__themeMediaAbort) window.__themeMediaAbort.abort();
  window.__themeMediaAbort = new AbortController();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.settings.theme === 'auto') applyTheme('auto');
  }, { signal: window.__themeMediaAbort.signal });

  // User menu
  initUserMenu();

  // API saves immediately, no need for beforeunload handler
  startAppPolling();
  if (window.WS) WS.connect();
  markPageReady();
}

// Start the app
async function bootApp() {
  try {
    if (typeof window.ensureProtectedPageAuth === 'function') {
      await window.ensureProtectedPageAuth();
    }
    await init();
  } catch {
    // Redirect handled by the auth guard.
  } finally {
    // Guarantee the page becomes visible even if init() throws,
    // so users never see an empty colored page.
    if (typeof markPageReady === 'function') markPageReady();
  }
}

bootApp();
