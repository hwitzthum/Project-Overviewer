/**
 * Shared test helpers for Playwright E2E tests
 */

const BASE_URL = 'http://localhost:3099';

const ADMIN = { username: 'testadmin', password: 'SecureTestPass123' };

/**
 * Login via API and return the auth token
 */
async function loginAPI(request, { username, password } = ADMIN) {
  const res = await request.post(`${BASE_URL}/api/auth/login`, {
    data: { username, password },
  });
  const body = await res.json();
  return { token: body.token, user: body.user, response: res };
}

/**
 * Register a new user via API
 */
async function registerAPI(request, { username, email, password }) {
  const res = await request.post(`${BASE_URL}/api/auth/register`, {
    data: { username, email, password },
  });
  return { response: res, body: await res.json() };
}

/**
 * Approve a user via admin API
 */
async function approveUserAPI(request, adminToken, userId) {
  return request.put(`${BASE_URL}/api/admin/users/${userId}/approve`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
}

/**
 * Create a project via API
 */
async function createProjectAPI(request, token, data = {}) {
  const res = await request.post(`${BASE_URL}/api/projects`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { title: 'Test Project', status: 'not-started', priority: 'medium', ...data },
  });
  return { response: res, body: await res.json() };
}

/**
 * Create a task via API
 */
async function createTaskAPI(request, token, projectId, data = {}) {
  const res = await request.post(`${BASE_URL}/api/projects/${projectId}/tasks`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { title: 'Test Task', ...data },
  });
  return { response: res, body: await res.json() };
}

/**
 * Create a document via API
 */
async function createDocumentAPI(request, token, projectId, data) {
  const res = await request.post(`${BASE_URL}/api/projects/${projectId}/documents`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
  return { response: res, body: await res.json() };
}

/**
 * Authenticated fetch helper
 */
function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Login via browser UI — fills the login form and submits
 */
async function loginUI(page, { username, password } = ADMIN) {
  await page.goto('/login.html');
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('#submitBtn');
}

/**
 * Generate a unique username for test isolation
 */
function uniqueUser(prefix = 'testuser') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

module.exports = {
  BASE_URL,
  ADMIN,
  loginAPI,
  registerAPI,
  approveUserAPI,
  createProjectAPI,
  createTaskAPI,
  createDocumentAPI,
  authHeaders,
  loginUI,
  uniqueUser,
};
