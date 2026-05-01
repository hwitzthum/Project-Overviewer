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

function openAdminModal({ title, message, confirmText, dangerConfirm = false, withPasswordField = false }) {
  return new Promise(resolve => {
    const overlay = document.getElementById('adminModal');
    const passwordWrap = document.getElementById('adminModalPasswordWrap');
    const passwordInput = document.getElementById('adminModalPassword');
    const passwordError = document.getElementById('adminModalPasswordError');
    const confirmBtn = document.getElementById('adminModalConfirm');

    document.getElementById('adminModalTitle').textContent = title;
    document.getElementById('adminModalMessage').textContent = message;
    confirmBtn.textContent = confirmText || 'Confirm';
    confirmBtn.className = `admin-btn${dangerConfirm ? ' danger' : ''}`;

    passwordWrap.style.display = withPasswordField ? '' : 'none';
    if (withPasswordField) {
      passwordInput.value = '';
      passwordError.style.display = 'none';
    }

    overlay.style.display = 'flex';

    if (withPasswordField) {
      setTimeout(() => passwordInput.focus(), 50);
    } else {
      confirmBtn.focus();
    }

    const ac = new AbortController();
    const { signal } = ac;

    function finish(result) {
      overlay.style.display = 'none';
      ac.abort();
      resolve(result);
    }

    document.addEventListener('keydown', e => { if (e.key === 'Escape') finish(null); }, { signal });
    overlay.addEventListener('click', e => { if (e.target === overlay) finish(null); }, { signal });
    document.getElementById('adminModalCancel').addEventListener('click', () => finish(null), { signal });

    confirmBtn.addEventListener('click', () => {
      if (withPasswordField) {
        const val = passwordInput.value;
        if (!val) {
          passwordError.style.display = '';
          passwordInput.focus();
          return;
        }
        finish(val);
      } else {
        finish(true);
      }
    }, { signal });

    if (withPasswordField) {
      passwordInput.addEventListener('keydown', e => { if (e.key === 'Enter') confirmBtn.click(); }, { signal });
    }
  });
}

async function approveAdminUser(id) {
  const adminPassword = await openAdminModal({
    title: 'Approve User',
    message: 'Enter your admin password to approve this user:',
    confirmText: 'Approve',
    withPasswordField: true,
  });
  if (!adminPassword) return;

  try {
    await API.approveUser(id, adminPassword);
    await loadAdminUsers();
  } catch (error) {
    showAdminToast(`Failed to approve user: ${error.message}`);
  }
}

async function changeAdminUserRole(id, role) {
  const adminPassword = await openAdminModal({
    title: 'Change User Role',
    message: `Enter your admin password to change this user's role to "${role}":`,
    confirmText: 'Change Role',
    withPasswordField: true,
  });
  if (!adminPassword) return;

  try {
    await API.changeUserRole(id, role, adminPassword);
    await loadAdminUsers();
  } catch (error) {
    showAdminToast(`Failed to change role: ${error.message}`);
  }
}

async function deleteAdminUser(id, username) {
  const confirmed = await openAdminModal({
    title: 'Delete User',
    message: `Delete "${username}"? This will permanently delete all their projects, tasks, and data.`,
    confirmText: 'Delete',
    dangerConfirm: true,
  });
  if (!confirmed) return;

  const adminPassword = await openAdminModal({
    title: 'Confirm Deletion',
    message: 'Enter your admin password to complete deletion:',
    confirmText: 'Delete',
    dangerConfirm: true,
    withPasswordField: true,
  });
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
    // Resolve theme with same priority as main app: explicit server theme > local preference
    try {
      const serverTheme = user.theme || await API.getSetting('theme');
      const localTheme = getStoredThemePreference();
      const activeTheme = (serverTheme && serverTheme !== 'auto')
        ? serverTheme
        : localTheme;
      applyTheme(activeTheme);
    } catch {
      // Boot-applied theme (from localStorage) is the fallback
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
