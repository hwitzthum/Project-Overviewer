const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { BASE_URL, loginAPI, authHeaders, createProjectAPI, adminStepUpPayload, registerAPI, approveUserAPI, uniqueUser } = require('./helpers');

const SECURITY_LOG_PATH = '/tmp/project-overviewer-security.log';

function readSecurityLogEntries() {
  if (!fs.existsSync(SECURITY_LOG_PATH)) return [];
  return fs.readFileSync(SECURITY_LOG_PATH, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

async function createApprovedUserToken(request, prefix = 'security') {
  const { token: adminToken } = await loginAPI(request);
  const username = uniqueUser(prefix);
  const { body } = await registerAPI(request, {
    username,
    email: `${username}@example.com`,
    password: 'SecurePass123'
  });
  await approveUserAPI(request, adminToken, body.user.id);
  const loginRes = await request.post(`${BASE_URL}/api/auth/login`, {
    data: { username, password: 'SecurePass123' }
  });
  const loginBody = await loginRes.json();
  return loginBody.token;
}

test.describe('Security Headers & Input Validation', () => {

  test('security headers present', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/health`);
    const headers = res.headers();

    // Helmet headers
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(headers['x-xss-protection']).toBeDefined();
    expect(headers['x-powered-by']).toBeUndefined();
  });

  test('CSP header present', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/login.html`);
    const csp = res.headers()['content-security-policy'];
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("script-src-attr 'none'");
  });

  test('health endpoint works without auth', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  // ─── XSS Prevention ────────────────────────────────────────

  test('XSS in project title is stored safely', async ({ request }) => {
    const { token } = await loginAPI(request);
    const xssPayload = '<script>alert("xss")</script>';

    const { response, body } = await createProjectAPI(request, token, {
      title: xssPayload,
    });
    expect(response.status()).toBe(201);

    // Fetch back — should be stored as-is (rendering escapes it)
    const getRes = await request.get(`${BASE_URL}/api/projects/${body.id}`, {
      headers: authHeaders(token),
    });
    const project = await getRes.json();
    expect(project.title).toBe(xssPayload); // Stored as text, UI escapes it
  });

  test('XSS in tags is handled safely', async ({ request }) => {
    const { token } = await loginAPI(request);
    const { response } = await createProjectAPI(request, token, {
      title: 'XSS Tags',
      tags: ['<img src=x onerror=alert(1)>', 'normal-tag'],
    });
    expect(response.status()).toBe(201);
  });

  // ─── Input Validation ──────────────────────────────────────

  test('reject overly long project title', async ({ request }) => {
    const { token } = await loginAPI(request);
    const res = await request.post(`${BASE_URL}/api/projects`, {
      headers: authHeaders(token),
      data: { title: 'x'.repeat(501) },
    });
    expect(res.status()).toBe(400);
  });

  test('reject invalid status enum', async ({ request }) => {
    const { token } = await loginAPI(request);
    const res = await request.post(`${BASE_URL}/api/projects`, {
      headers: authHeaders(token),
      data: { title: 'Bad Status', status: 'invalid-status' },
    });
    expect(res.status()).toBe(400);
  });

  test('reject invalid priority enum', async ({ request }) => {
    const { token } = await loginAPI(request);
    const res = await request.post(`${BASE_URL}/api/projects`, {
      headers: authHeaders(token),
      data: { title: 'Bad Priority', priority: 'critical' },
    });
    expect(res.status()).toBe(400);
  });

  test('reject invalid settings key', async ({ request }) => {
    const { token } = await loginAPI(request);
    const res = await request.post(`${BASE_URL}/api/settings/maliciousKey`, {
      headers: authHeaders(token),
      data: { value: 'evil' },
    });
    expect(res.status()).toBe(400);
  });

  test('reject invalid global settings key', async ({ request }) => {
    const { token } = await loginAPI(request);
    const res = await request.post(`${BASE_URL}/api/admin/settings/maliciousKey`, {
      headers: authHeaders(token),
      data: { value: 'evil' },
    });
    expect(res.status()).toBe(400);
  });

  test('reject oversized user setting payloads', async ({ request }) => {
    const { token } = await loginAPI(request);
    const res = await request.post(`${BASE_URL}/api/settings/theme`, {
      headers: authHeaders(token),
      data: { value: 'x'.repeat(20 * 1024) },
    });
    expect(res.status()).toBe(400);
  });

  test('reject invalid document upload payloads', async ({ request }) => {
    const { token } = await loginAPI(request);
    const { body: project } = await createProjectAPI(request, token, {
      title: 'Document Validation'
    });
    const res = await request.post(`${BASE_URL}/api/projects/${project.id}/documents`, {
      headers: authHeaders(token),
      data: {
        type: 'docx',
        title: 'bad',
        fileName: 'bad.docx',
        mimeType: 'text/html',
        contentBase64: 'PGgxPmJhZDwvaDE+'
      },
    });
    expect(res.status()).toBe(400);
  });

  test('reject document upload with mismatched allowed mime and file signature', async ({ request }) => {
    const { token } = await loginAPI(request);
    const { body: project } = await createProjectAPI(request, token, {
      title: 'Signature Validation'
    });
    const res = await request.post(`${BASE_URL}/api/projects/${project.id}/documents`, {
      headers: authHeaders(token),
      data: {
        type: 'docx',
        title: 'fake-pdf.docx',
        fileName: 'fake-pdf.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        contentBase64: Buffer.from('%PDF-1.7\nnot really a docx', 'utf8').toString('base64')
      },
    });
    expect(res.status()).toBe(400);
  });

  // ─── Settings ──────────────────────────────────────────────

  test('user settings CRUD', async ({ request }) => {
    const { token } = await loginAPI(request);

    // Set
    const setRes = await request.post(`${BASE_URL}/api/settings/theme`, {
      headers: authHeaders(token),
      data: { value: 'dark' },
    });
    expect(setRes.status()).toBe(200);

    // Get
    const getRes = await request.get(`${BASE_URL}/api/settings/theme`, {
      headers: authHeaders(token),
    });
    expect(getRes.status()).toBe(200);
    const { value } = await getRes.json();
    expect(value).toBe('dark');

    // Get all
    const allRes = await request.get(`${BASE_URL}/api/settings`, {
      headers: authHeaders(token),
    });
    expect(allRes.status()).toBe(200);
    expect(allRes.headers()['cache-control']).toBe('private, no-cache, must-revalidate');
  });

  // ─── Quick Notes ───────────────────────────────────────────

  test('quick notes CRUD', async ({ request }) => {
    const { token } = await loginAPI(request);

    // Save
    const saveRes = await request.post(`${BASE_URL}/api/notes`, {
      headers: authHeaders(token),
      data: { content: 'My test notes' },
    });
    expect(saveRes.status()).toBe(200);

    // Get
    const getRes = await request.get(`${BASE_URL}/api/notes`, {
      headers: authHeaders(token),
    });
    expect(getRes.status()).toBe(200);
    const { content } = await getRes.json();
    expect(content).toBe('My test notes');
  });

  test('same-origin cookie-authenticated writes succeed', async ({ request }) => {
    const loginRes = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { username: 'testadmin', password: 'SecureTestPass123' },
    });
    expect(loginRes.status()).toBe(200);

    const cookie = loginRes.headers()['set-cookie'].split(';')[0];
    const res = await request.post(`${BASE_URL}/api/notes`, {
      headers: {
        Cookie: cookie,
        Referer: `${BASE_URL}/`
      },
      data: { content: 'same-origin note' },
    });
    expect(res.status()).toBe(200);
  });

  test('cross-site cookie-authenticated writes are rejected', async ({ request }) => {
    const loginRes = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { username: 'testadmin', password: 'SecureTestPass123' },
    });
    expect(loginRes.status()).toBe(200);

    const cookie = loginRes.headers()['set-cookie'].split(';')[0];
    const res = await request.post(`${BASE_URL}/api/notes`, {
      headers: {
        Cookie: cookie,
        Origin: 'https://evil.example'
      },
      data: { content: 'blocked note' },
    });
    expect(res.status()).toBe(403);
  });

  test('failed login is written to the security event log', async ({ request }) => {
    fs.rmSync(SECURITY_LOG_PATH, { force: true });

    const attemptedUsername = `missing_${Date.now()}`;
    const res = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { username: attemptedUsername, password: 'WrongPassword123' },
    });

    expect(res.status()).toBe(401);

    const events = readSecurityLogEntries().filter(entry => entry.eventType === 'auth.login.failed');
    const loginFailure = events.find(entry => entry.attemptedUsername === attemptedUsername);

    expect(loginFailure).toBeTruthy();
    expect(loginFailure.logType).toBe('security');
    expect(loginFailure.outcome).toBe('failure');
  });

  test('admin authorization denials are written to the security event log', async ({ request }) => {
    fs.rmSync(SECURITY_LOG_PATH, { force: true });

    const { token } = await loginAPI(request);
    const suffix = Date.now();

    const userRes = await request.post(`${BASE_URL}/api/auth/register`, {
      data: {
        username: `securitylog_${suffix}`,
        email: `securitylog_${suffix}@example.com`,
        password: 'SecurePass123'
      },
    });
    const userBody = await userRes.json();

    await request.put(`${BASE_URL}/api/admin/users/${userBody.user.id}/approve`, {
      headers: authHeaders(token),
      data: adminStepUpPayload(),
    });

    const loginRes = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { username: userBody.user.username, password: 'SecurePass123' },
    });
    const loginBody = await loginRes.json();

    const res = await request.get(`${BASE_URL}/api/admin/users`, {
      headers: authHeaders(loginBody.token),
    });
    expect(res.status()).toBe(403);

    const events = readSecurityLogEntries().filter(entry => entry.eventType === 'authz.admin_denied');
    const denialEvent = events.find(entry => entry.actorUsername === userBody.user.username);

    expect(denialEvent).toBeTruthy();
    expect(denialEvent.logType).toBe('security');
    expect(denialEvent.outcome).toBe('denied');
  });

  // ─── Templates ─────────────────────────────────────────────

  test('templates endpoint returns array', async ({ request }) => {
    const { token } = await loginAPI(request);
    const res = await request.get(`${BASE_URL}/api/templates`, {
      headers: authHeaders(token),
    });
    expect(res.status()).toBe(200);
    const templates = await res.json();
    expect(Array.isArray(templates)).toBe(true);
  });

  // ─── Export/Import ─────────────────────────────────────────

  test('export returns user data', async ({ request }) => {
    const token = await createApprovedUserToken(request, 'exportOnly');
    const res = await request.get(`${BASE_URL}/api/export`, {
      headers: authHeaders(token),
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('projects');
  });

  test('import and verify data', async ({ request }) => {
    const token = await createApprovedUserToken(request, 'importRoundTrip');

    await createProjectAPI(request, token, {
      title: 'Import Round Trip',
      tags: ['backup']
    });

    // Export current data
    const exportRes = await request.get(`${BASE_URL}/api/export`, {
      headers: authHeaders(token),
    });
    const exportData = await exportRes.json();

    // Import it back
    const importRes = await request.post(`${BASE_URL}/api/import`, {
      headers: authHeaders(token),
      data: exportData,
    });
    expect(importRes.status()).toBe(200);
  });

  test('reject import with invalid project fields', async ({ request }) => {
    const { token } = await loginAPI(request);
    const res = await request.post(`${BASE_URL}/api/import`, {
      headers: authHeaders(token),
      data: {
        projects: [{
          title: 'Bad Import',
          status: 'owned-status',
          priority: 'medium',
          dueDate: 'x" data-owned="1'
        }]
      },
    });
    expect(res.status()).toBe(400);
  });

  test('reject import with unsupported document MIME type', async ({ request }) => {
    const { token } = await loginAPI(request);
    const res = await request.post(`${BASE_URL}/api/import`, {
      headers: authHeaders(token),
      data: {
        projects: [{
          title: 'Bad Doc Import',
          documents: [{
            type: 'docx',
            title: 'evil',
            fileName: 'evil.docx',
            mimeType: 'text/html',
            contentBase64: 'PGgxPkVWSUw8L2gxPg=='
          }]
        }]
      },
    });
    expect(res.status()).toBe(400);
  });

  test('reject import with mismatched document signature', async ({ request }) => {
    const { token } = await loginAPI(request);
    const res = await request.post(`${BASE_URL}/api/import`, {
      headers: authHeaders(token),
      data: {
        projects: [{
          title: 'Bad Signature Import',
          documents: [{
            type: 'docx',
            title: 'evil',
            fileName: 'evil.docx',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            contentBase64: Buffer.from('%PDF-1.7 not really a docx', 'utf8').toString('base64')
          }]
        }]
      },
    });
    expect(res.status()).toBe(400);
  });

  // ─── 404 Handling ──────────────────────────────────────────

  test('unknown API route returns 404 JSON', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/nonexistent`);
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Not found');
  });

  test('non-API routes serve index.html (SPA fallback)', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/some/random/path`);
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toContain('<!DOCTYPE html>');
  });
});
