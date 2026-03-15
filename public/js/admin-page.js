let adminToastTimer;
let adminUsers = [];

function initAdminThemePicker() {
  applyTheme(getStoredThemePreference(), { persist: false });
  bindThemeControls({
    selector: '.theme-dot',
    onThemeChange: async theme => {
      try {
        await API.setSetting('theme', theme);
      } catch (error) {
        showAdminToast(`Failed to save theme: ${error.message}`);
      }
    }
  });
}

function showAdminToast(message, type = 'error') {
  const toast = document.getElementById('adminToast');
  toast.textContent = message;
  toast.className = `admin-toast ${type}`;
  toast.style.display = '';
  clearTimeout(adminToastTimer);
  adminToastTimer = setTimeout(() => {
    toast.style.display = 'none';
  }, 4000);
}

function renderAdminStats() {
  document.getElementById('statTotal').textContent = adminUsers.length;
  document.getElementById('statPending').textContent = adminUsers.filter(user => !user.approved).length;
  document.getElementById('statActive').textContent = adminUsers.filter(user => user.approved).length;
}

function renderAdminUserRow(user) {
  const row = document.createElement('div');
  row.className = 'admin-user-row';

  const avatar = document.createElement('div');
  avatar.className = 'admin-user-avatar';
  avatar.textContent = (user.username || '?')[0].toUpperCase();

  const info = document.createElement('div');
  info.className = 'admin-user-info';
  const nameEl = document.createElement('div');
  nameEl.className = 'admin-user-name';
  nameEl.textContent = user.username;
  const emailEl = document.createElement('div');
  emailEl.className = 'admin-user-email';
  emailEl.textContent = user.email;
  info.appendChild(nameEl);
  info.appendChild(emailEl);

  const roleBadge = document.createElement('span');
  roleBadge.className = `admin-badge ${user.role === 'admin' ? 'admin' : 'user'}`;
  roleBadge.textContent = user.role;

  const statusBadge = document.createElement('span');
  statusBadge.className = `admin-badge ${user.approved ? 'approved' : 'pending'}`;
  statusBadge.textContent = user.approved ? 'active' : 'pending';

  const actions = document.createElement('div');
  actions.className = 'admin-actions';

  if (!user.approved) {
    const approveBtn = document.createElement('button');
    approveBtn.className = 'admin-btn approve';
    approveBtn.textContent = 'Approve';
    approveBtn.addEventListener('click', () => approveAdminUser(user.id));
    actions.appendChild(approveBtn);
  }

  const roleBtn = document.createElement('button');
  roleBtn.className = 'admin-btn';
  roleBtn.textContent = user.role === 'admin' ? 'Make User' : 'Make Admin';
  roleBtn.addEventListener('click', () => changeAdminUserRole(user.id, user.role === 'admin' ? 'user' : 'admin'));
  actions.appendChild(roleBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'admin-btn danger';
  deleteBtn.textContent = 'Delete';
  deleteBtn.addEventListener('click', () => deleteAdminUser(user.id, user.username));
  actions.appendChild(deleteBtn);

  row.appendChild(avatar);
  row.appendChild(info);
  row.appendChild(roleBadge);
  row.appendChild(statusBadge);
  row.appendChild(actions);
  return row;
}

function renderPendingUsers() {
  const pending = adminUsers.filter(user => !user.approved);
  const section = document.getElementById('pendingSection');
  const list = document.getElementById('pendingList');
  list.textContent = '';

  if (pending.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';
  pending.forEach(user => list.appendChild(renderAdminUserRow(user)));
}

function renderAllAdminUsers() {
  const list = document.getElementById('userList');
  list.textContent = '';

  if (adminUsers.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'admin-empty';
    empty.textContent = 'No users found.';
    list.appendChild(empty);
    return;
  }

  adminUsers.forEach(user => list.appendChild(renderAdminUserRow(user)));
}

async function loadAdminUsers() {
  try {
    adminUsers = await API.getUsers();
    renderAdminStats();
    renderPendingUsers();
    renderAllAdminUsers();
  } catch (error) {
    if (error.message.includes('Admin') || error.message.includes('403')) {
      window.location.href = '/index.html';
      return;
    }
    document.getElementById('userList').textContent = 'Failed to load users.';
  }
}

function promptAdminPassword() {
  const value = window.prompt('Confirm your admin password to continue:');
  return typeof value === 'string' ? value : null;
}

async function approveAdminUser(id) {
  const adminPassword = promptAdminPassword();
  if (!adminPassword) return;

  try {
    await API.approveUser(id, adminPassword);
    await loadAdminUsers();
  } catch (error) {
    showAdminToast(`Failed to approve user: ${error.message}`);
  }
}

async function changeAdminUserRole(id, role) {
  const adminPassword = promptAdminPassword();
  if (!adminPassword) return;

  try {
    await API.changeUserRole(id, role, adminPassword);
    await loadAdminUsers();
  } catch (error) {
    showAdminToast(`Failed to change role: ${error.message}`);
  }
}

async function deleteAdminUser(id, username) {
  if (!window.confirm(`Delete user "${username}"? This will delete all their data.`)) {
    return;
  }

  const adminPassword = promptAdminPassword();
  if (!adminPassword) return;

  try {
    await API.deleteUser(id, adminPassword);
    await loadAdminUsers();
  } catch (error) {
    showAdminToast(`Failed to delete user: ${error.message}`);
  }
}

function initAdminPage() {
  markPagePending();
  initAdminThemePicker();

  API.getMe().then(async user => {
    if (user.role !== 'admin') {
      window.location.href = '/index.html';
      return;
    }
    document.documentElement.setAttribute('data-auth-state', 'authorized');
    let hasLocalTheme = false;
    try {
      hasLocalTheme = Boolean(localStorage.getItem('theme'));
    } catch {
      hasLocalTheme = false;
    }
    if (!hasLocalTheme) {
      try {
        const theme = await API.getSetting('theme');
        if (theme) {
          applyTheme(theme);
        }
      } catch {
        // Local preference is already applied as a fallback.
      }
    }
    markThemeReady();
    await loadAdminUsers();
    startAdminPolling();
  }).catch(() => {
    window.location.href = '/login.html';
  }).finally(() => {
    markPageReady();
  });
}

window.addEventListener('DOMContentLoaded', initAdminPage);
