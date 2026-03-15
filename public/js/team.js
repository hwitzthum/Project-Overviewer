// Project Overviewer — Team Management & Workspace
let workspaceToggleAppliedMode = 'team';
let workspaceToggleRequestedMode = 'team';
let workspaceToggleInFlight = false;
const pendingTeamActions = new Set();

async function withPendingState(actionKey, button, action, relatedInputs = []) {
  if (!button || pendingTeamActions.has(actionKey)) return;

  pendingTeamActions.add(actionKey);
  button.disabled = true;
  relatedInputs.forEach(input => {
    if (input) input.disabled = true;
  });

  try {
    return await action();
  } finally {
    if (button.isConnected) {
      button.disabled = false;
    }
    relatedInputs.forEach(input => {
      if (input?.isConnected) input.disabled = false;
    });
    pendingTeamActions.delete(actionKey);
  }
}

async function initUserMenu() {
  try {
    const user = await API.getMe();
    const avatar = document.getElementById('userAvatar');
    const name = document.getElementById('userName');
    avatar.textContent = (user.username || '?')[0].toUpperCase();
    name.textContent = user.username;

    // Show admin link if admin
    if (user.role === 'admin') {
      document.getElementById('menuAdmin').style.display = '';
    }

    // Toggle dropdown
    document.getElementById('userMenuTrigger').addEventListener('click', (e) => {
      e.stopPropagation();
      const dd = document.getElementById('userMenuDropdown');
      dd.style.display = dd.style.display === 'none' ? '' : 'none';
    });

    // Close on outside click (use capture to ensure it fires, and named function for cleanup)
    function closeUserMenu() {
      document.getElementById('userMenuDropdown').style.display = 'none';
    }
    document.addEventListener('click', closeUserMenu);

    // Menu actions
    document.getElementById('menuSettings').addEventListener('click', () => {
      document.getElementById('userMenuDropdown').style.display = 'none';
      document.getElementById('openSettings').click();
    });

    document.getElementById('menuAdmin').addEventListener('click', () => {
      window.location.href = '/admin.html';
    });

    document.getElementById('menuLogout').addEventListener('click', () => {
      API.logout();
    });

    // Team menu
    document.getElementById('menuTeam').addEventListener('click', () => {
      document.getElementById('userMenuDropdown').style.display = 'none';
      openModal('settingsModal');
      // Scroll to team section
      setTimeout(() => {
        document.getElementById('teamSection').scrollIntoView({ behavior: 'smooth' });
      }, 100);
    });

    // Initialize workspace toggle (pass user to avoid duplicate API call)
    await initWorkspaceToggle(user);
    render();
    // Load team info for settings
    await loadTeamInfo();
  } catch (err) {
    console.error('Failed to init user menu:', err);
  }
}

// ========== WORKSPACE TOGGLE ==========


async function initWorkspaceToggle(user) {
  try {
    currentUserId = user.id;

    // Load saved workspace mode
    const savedWorkspaceMode = state.settings.workspaceMode;
    if (savedWorkspaceMode === 'personal' || savedWorkspaceMode === 'team') {
      currentWorkspaceMode = savedWorkspaceMode;
    } else {
      try {
        const saved = await API.getSetting('workspaceMode');
        if (saved === 'personal' || saved === 'team') {
          currentWorkspaceMode = saved;
        }
      } catch (e) { /* default to team */ }
    }

    workspaceToggleAppliedMode = currentWorkspaceMode;
    workspaceToggleRequestedMode = currentWorkspaceMode;

    updateWorkspaceToggleUI();

    // Click handlers
    document.querySelectorAll('.workspace-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        if (!mode || mode === workspaceToggleRequestedMode) return;
        workspaceToggleRequestedMode = mode;
        currentWorkspaceMode = mode;
        updateWorkspaceToggleUI();
        flushWorkspaceToggle();
      });
    });
  } catch (e) {
    console.error('Failed to init workspace toggle:', e);
  }
}

async function flushWorkspaceToggle() {
  if (workspaceToggleInFlight) return;

  workspaceToggleInFlight = true;
  try {
    while (workspaceToggleAppliedMode !== workspaceToggleRequestedMode) {
      const mode = workspaceToggleRequestedMode;
      await API.setSetting('workspaceMode', mode);
      workspaceToggleAppliedMode = mode;
      await loadFromStorage();
    }
    currentWorkspaceMode = workspaceToggleRequestedMode;
    render();
  } catch (e) {
    console.error('Failed to switch workspace:', e);
    currentWorkspaceMode = workspaceToggleAppliedMode;
    updateWorkspaceToggleUI();
    await loadFromStorage();
    render();
    showToast('Failed to switch workspace', 'error');
  } finally {
    workspaceToggleInFlight = false;
    updateWorkspaceToggleUI();
    if (workspaceToggleAppliedMode !== workspaceToggleRequestedMode) {
      flushWorkspaceToggle();
    }
  }
}

function updateWorkspaceToggleUI() {
  document.querySelectorAll('.workspace-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === currentWorkspaceMode);
  });
}

// ========== TEAM MANAGEMENT ==========


async function loadTeamInfo() {
  const container = document.getElementById('teamContent');
  try {
    const result = await API.getMyTeam();
    currentTeam = result.team !== undefined ? result : (result.id ? result : null);

    if (!currentTeam || currentTeam.team === null) {
      currentTeam = null;
      // Clear container safely using textContent first, then build DOM
      container.textContent = '';
      renderNoTeam(container);
    } else {
      container.textContent = '';
      renderTeamPanel(container, currentTeam);
    }
  } catch (e) {
    console.error('Failed to load team info:', e);
    container.textContent = 'Failed to load team info.';
  }
}

function renderNoTeam(container) {
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;flex-direction:column;gap:12px;';

  const msg = document.createElement('p');
  msg.style.cssText = 'color:var(--text-tertiary);font-size:13px;margin:0;';
  msg.textContent = 'You are not in a team. Create one or ask a team owner to invite you.';
  div.appendChild(msg);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Team name';
  input.style.cssText = 'flex:1;padding:6px 10px;border:1px solid var(--border-color);border-radius:var(--radius-sm);background:var(--bg-primary);color:var(--text-primary);font-size:13px;';
  row.appendChild(input);

  const btn = document.createElement('button');
  btn.textContent = 'Create Team';
  btn.style.cssText = 'padding:6px 12px;border:none;border-radius:var(--radius-sm);background:var(--accent);color:#fff;font-size:13px;cursor:pointer;';
  btn.addEventListener('click', async () => {
    const name = input.value.trim();
    if (!name) return;
    await withPendingState('create-team', btn, async () => {
      try {
        await API.createTeam(name);
        showToast('Team created!');
        await loadTeamInfo();
      } catch (err) {
        showToast(err.message || 'Failed to create team');
      }
    }, [input]);
  });
  row.appendChild(btn);
  div.appendChild(row);
  container.appendChild(div);
}

function renderTeamPanel(container, team) {
  const wrapper = document.createElement('div');

  // Team name header
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;';
  const nameEl = document.createElement('strong');
  nameEl.style.cssText = 'font-size:15px;color:var(--text-primary);';
  nameEl.textContent = team.name;
  header.appendChild(nameEl);

  const roleBadge = document.createElement('span');
  roleBadge.style.cssText = 'font-size:11px;padding:2px 8px;border-radius:10px;background:rgba(var(--accent-rgb),0.1);color:var(--accent);text-transform:uppercase;';
  roleBadge.textContent = team.myRole;
  header.appendChild(roleBadge);
  wrapper.appendChild(header);

  // Members list
  const membersLabel = document.createElement('div');
  membersLabel.style.cssText = 'font-size:12px;color:var(--text-tertiary);margin-bottom:6px;';
  membersLabel.textContent = `Members (${team.members.length})`;
  wrapper.appendChild(membersLabel);

  const list = document.createElement('div');
  list.className = 'team-member-list';

  for (const member of team.members) {
    const row = document.createElement('div');
    row.className = 'team-member-row';

    const avatar = document.createElement('div');
    avatar.className = 'team-member-avatar';
    avatar.textContent = (member.username || '?')[0].toUpperCase();
    row.appendChild(avatar);

    const info = document.createElement('div');
    info.className = 'team-member-info';
    const nm = document.createElement('div');
    nm.className = 'team-member-name';
    nm.textContent = member.username;
    info.appendChild(nm);
    const rl = document.createElement('div');
    rl.className = 'team-member-role';
    rl.textContent = member.role;
    info.appendChild(rl);
    row.appendChild(info);

    // Remove button (only for non-owners, and only if caller is owner)
    if (team.myRole === 'owner' && member.role !== 'owner') {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'team-member-remove';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', async () => {
        if (!confirm('Remove ' + member.username + ' from the team?')) return;
        await withPendingState(`remove-member:${team.id}:${member.userId}`, removeBtn, async () => {
          try {
            await API.removeTeamMember(team.id, member.userId);
            showToast(member.username + ' removed');
            await loadTeamInfo();
          } catch (err) {
            showToast(err.message || 'Failed to remove member');
          }
        });
      });
      row.appendChild(removeBtn);
    }

    list.appendChild(row);
  }
  wrapper.appendChild(list);

  // Invite input (only for owner)
  if (team.myRole === 'owner') {
    const inviteRow = document.createElement('div');
    inviteRow.className = 'team-invite-row';

    const inviteInput = document.createElement('input');
    inviteInput.type = 'text';
    inviteInput.placeholder = 'Username to invite';
    inviteRow.appendChild(inviteInput);

    const inviteBtn = document.createElement('button');
    inviteBtn.textContent = 'Invite';
    inviteBtn.addEventListener('click', async () => {
      const username = inviteInput.value.trim();
      if (!username) return;
      await withPendingState(`invite-member:${team.id}`, inviteBtn, async () => {
        try {
          await API.addTeamMember(team.id, username);
          inviteInput.value = '';
          showToast(username + ' added to team!');
          await loadTeamInfo();
        } catch (err) {
          showToast(err.message || 'Failed to invite user');
        }
      }, [inviteInput]);
    });
    inviteRow.appendChild(inviteBtn);
    wrapper.appendChild(inviteRow);
  }

  // Actions (leave / delete)
  const actions = document.createElement('div');
  actions.className = 'team-actions';

  if (team.myRole === 'owner') {
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete Team';
    deleteBtn.style.cssText = 'padding:6px 12px;border:1px solid rgba(255,59,48,0.3);border-radius:var(--radius-sm);background:transparent;color:var(--danger);font-size:12px;cursor:pointer;';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('Delete team "' + team.name + '"? All members will be removed.')) return;
      await withPendingState(`delete-team:${team.id}`, deleteBtn, async () => {
        try {
          await API.deleteTeam(team.id);
          showToast('Team deleted');
          currentTeam = null;
          await loadTeamInfo();
          await loadFromStorage();
          render();
        } catch (err) {
          showToast(err.message || 'Failed to delete team');
        }
      });
    });
    actions.appendChild(deleteBtn);
  } else {
    const leaveBtn = document.createElement('button');
    leaveBtn.textContent = 'Leave Team';
    leaveBtn.style.cssText = 'padding:6px 12px;border:1px solid rgba(255,59,48,0.3);border-radius:var(--radius-sm);background:transparent;color:var(--danger);font-size:12px;cursor:pointer;';
    leaveBtn.addEventListener('click', async () => {
      if (!confirm('Leave team "' + team.name + '"?')) return;
      await withPendingState(`leave-team:${team.id}`, leaveBtn, async () => {
        try {
          await API.leaveTeam(team.id);
          showToast('Left team');
          currentTeam = null;
          await loadTeamInfo();
          await loadFromStorage();
          render();
        } catch (err) {
          showToast(err.message || 'Failed to leave team');
        }
      });
    });
    actions.appendChild(leaveBtn);
  }

  wrapper.appendChild(actions);
  container.appendChild(wrapper);
}

function updateViewTitle() {
  const titles = {
    'all': 'All Projects',
    'kanban': 'Kanban Board',
    'focus': 'Focus Mode',
    'active': 'in-progress',
    'not-started': 'not-started',
    'in-progress': 'in-progress',
    'backlog': 'backlog',
    'completed': 'completed',
    'archived': 'Archived Projects',
    'overdue': 'Overdue',
    'today': 'Due Today',
    'week': 'Due This Week',
    'smart-overdue': 'Overdue Tasks',
    'smart-due-soon': 'Due in 3 Days',
    'smart-waiting': 'Waiting on Stakeholder',
    'priority-high': 'High Priority',
    'priority-medium': 'Medium Priority',
    'priority-low': 'Low Priority'
  };
  let title = titles[currentView] || 'Projects';
  if (currentView === 'project' && currentProjectId) {
    const project = state.projects.find(p => p.id === currentProjectId);
    title = project ? project.title : 'Project';
  }
  if (currentView.startsWith('tag-')) {
    title = `Tag: ${currentView.replace('tag-', '')}`;
  }
  if (currentView.startsWith('stakeholder-')) {
    title = `Stakeholder: ${decodeStakeholderView(currentView)}`;
  }
  document.getElementById('viewTitle').textContent = title;
}
