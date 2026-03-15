// API Client for Project Overviewer — with authentication
const API_BASE = '';
const API_LEGACY_PREFIX = '/api/';
const API_VERSION_PREFIX = '/api/v1/';
const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function buildApiPath(endpoint) {
  const value = String(endpoint || '');
  if (value.startsWith(API_VERSION_PREFIX)) return value;
  if (value.startsWith(API_LEGACY_PREFIX)) {
    return value.replace(API_LEGACY_PREFIX, API_VERSION_PREFIX);
  }
  return value;
}

function getComparableApiPath(endpoint) {
  const value = buildApiPath(endpoint);
  if (value.startsWith(API_VERSION_PREFIX)) {
    return value.replace(API_VERSION_PREFIX, API_LEGACY_PREFIX);
  }
  return value;
}

window.buildApiPath = buildApiPath;

function markPollingMutation(endpoint, method) {
  if (SAFE_HTTP_METHODS.has(method)) return;
  const comparableEndpoint = getComparableApiPath(endpoint);

  if (
    (comparableEndpoint.startsWith('/api/projects') ||
      comparableEndpoint.startsWith('/api/tasks') ||
      comparableEndpoint.startsWith('/api/documents') ||
      comparableEndpoint.startsWith('/api/teams')) &&
    typeof window.markSharedDataMutation === 'function'
  ) {
    window.markSharedDataMutation();
  }

  if (
    comparableEndpoint.startsWith('/api/admin/users') &&
    typeof window.markAdminUsersMutation === 'function'
  ) {
    window.markAdminUsersMutation();
  }
}

class API {
  static token = null;

  static setToken(token) {
    this.token = token;
  }

  static async request(endpoint, options = {}) {
    try {
      const method = String(options.method || 'GET').toUpperCase();
      const requestEndpoint = buildApiPath(endpoint);
      markPollingMutation(requestEndpoint, method);

      const headers = {
        'Content-Type': 'application/json',
        ...options.headers
      };

      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      const response = await fetch(`${API_BASE}${requestEndpoint}`, {
        ...options,
        headers
      });

      // Handle 401 responses
      if (response.status === 401) {
        const error = await response.json().catch(() => ({}));
        this.setToken(null);
        if (!window.location.pathname.includes('login') && !window.location.pathname.includes('register')) {
          window.location.href = '/login.html';
        }
        throw new Error(error.error || 'Authentication required');
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API Error [${buildApiPath(endpoint)}]:`, error);
      throw error;
    }
  }

  // ========== AUTH ==========
  static async login(username, password) {
    const result = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    this.setToken(result.token);
    return result;
  }

  static async register(username, email, password) {
    return await this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password })
    });
  }

  static async logout() {
    try {
      await this.request('/api/auth/logout', { method: 'POST' });
    } finally {
      this.setToken(null);
      window.location.href = '/login.html';
    }
  }

  static async getMe() {
    return await this.request('/api/auth/me');
  }

  static async changePassword(currentPassword, newPassword) {
    const result = await this.request('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword })
    });
    if (result.token) this.setToken(result.token);
    return result;
  }

  // ========== ADMIN ==========
  static async getUsers() {
    return await this.request('/api/admin/users');
  }

  static async approveUser(id) {
    return await this.request(`/api/admin/users/${id}/approve`, { method: 'PUT' });
  }

  static async changeUserRole(id, role) {
    return await this.request(`/api/admin/users/${id}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role })
    });
  }

  static async deleteUser(id) {
    return await this.request(`/api/admin/users/${id}`, { method: 'DELETE' });
  }

  static async getGlobalSettings() {
    return await this.request('/api/admin/settings');
  }

  static async setGlobalSetting(key, value) {
    return await this.request(`/api/admin/settings/${key}`, {
      method: 'POST',
      body: JSON.stringify({ value })
    });
  }

  // ========== TEAMS ==========
  static async createTeam(name) {
    return await this.request('/api/teams', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
  }

  static async getMyTeam() {
    return await this.request('/api/teams/mine');
  }

  static async addTeamMember(teamId, username) {
    return await this.request(`/api/teams/${teamId}/members`, {
      method: 'POST',
      body: JSON.stringify({ username })
    });
  }

  static async removeTeamMember(teamId, userId) {
    return await this.request(`/api/teams/${teamId}/members/${userId}`, {
      method: 'DELETE'
    });
  }

  static async leaveTeam(teamId) {
    return await this.request(`/api/teams/${teamId}/leave`, {
      method: 'POST'
    });
  }

  static async deleteTeam(teamId) {
    return await this.request(`/api/teams/${teamId}`, {
      method: 'DELETE'
    });
  }

  // ========== PROJECTS ==========
  static async getAllProjects() {
    return await this.request('/api/projects');
  }

  static async getProject(id) {
    return await this.request(`/api/projects/${id}`);
  }

  static async createProject(project) {
    return await this.request('/api/projects', {
      method: 'POST',
      body: JSON.stringify(project)
    });
  }

  static async updateProject(id, updates) {
    return await this.request(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  }

  static async deleteProject(id) {
    return await this.request(`/api/projects/${id}`, { method: 'DELETE' });
  }

  static async reorderProjects(projectOrders) {
    return await this.request('/api/projects/reorder', {
      method: 'POST',
      body: JSON.stringify(projectOrders)
    });
  }

  // ========== TASKS ==========
  static async getProjectTasks(projectId) {
    return await this.request(`/api/projects/${projectId}/tasks`);
  }

  static async createTask(projectId, task) {
    return await this.request(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(task)
    });
  }

  static async updateTask(taskId, updates) {
    return await this.request(`/api/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  }

  static async deleteTask(taskId) {
    return await this.request(`/api/tasks/${taskId}`, { method: 'DELETE' });
  }

  static async reorderTasks(projectId, taskOrders) {
    return await this.request(`/api/projects/${projectId}/tasks/reorder`, {
      method: 'POST',
      body: JSON.stringify(taskOrders)
    });
  }

  // ========== DOCUMENTS ==========
  static async getProjectDocuments(projectId) {
    return await this.request(`/api/projects/${projectId}/documents`);
  }

  static async createDocument(projectId, document) {
    return await this.request(`/api/projects/${projectId}/documents`, {
      method: 'POST',
      body: JSON.stringify(document)
    });
  }

  static async deleteDocument(documentId) {
    return await this.request(`/api/documents/${documentId}`, { method: 'DELETE' });
  }

  static async getDocumentPreview(documentId) {
    return await this.request(`/api/documents/${documentId}/preview`);
  }

  // ========== SETTINGS ==========
  static async getAllSettings() {
    return await this.request('/api/settings');
  }

  static async getSetting(key) {
    const result = await this.request(`/api/settings/${key}`);
    return result.value;
  }

  static async setSetting(key, value) {
    return await this.request(`/api/settings/${key}`, {
      method: 'POST',
      body: JSON.stringify({ value })
    });
  }

  // ========== QUICK NOTES ==========
  static async getQuickNotes() {
    const result = await this.request('/api/notes');
    return result.content;
  }

  static async saveQuickNotes(content) {
    return await this.request('/api/notes', {
      method: 'POST',
      body: JSON.stringify({ content })
    });
  }

  // ========== TEMPLATES ==========
  static async getTemplates() {
    return await this.request('/api/templates');
  }

  // ========== EXPORT/IMPORT ==========
  static async exportData() {
    return await this.request('/api/export');
  }

  static async importData(data) {
    return await this.request('/api/import', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
}

window.API = API;
