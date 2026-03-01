// API Client for Project Overviewer
const API_BASE = '';  // Empty string since we're serving from same origin

class API {
  // Helper method for fetch requests
  static async request(endpoint, options = {}) {
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  }

  // ========== PROJECTS ==========
  static async getAllProjects() {
    return await this.request('/api/projects');
  }

  static async getProject(id, options = {}) {
    const params = new URLSearchParams();
    if (options.includeDocumentContent) {
      params.set('includeDocumentContent', '1');
    }
    const query = params.toString();
    return await this.request(`/api/projects/${id}${query ? `?${query}` : ''}`);
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
    return await this.request(`/api/projects/${id}`, {
      method: 'DELETE'
    });
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
    return await this.request(`/api/tasks/${taskId}`, {
      method: 'DELETE'
    });
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
    return await this.request(`/api/documents/${documentId}`, {
      method: 'DELETE'
    });
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

// Make it available globally
window.API = API;
