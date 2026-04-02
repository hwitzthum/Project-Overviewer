/**
 * E2E tests for security audit fixes.
 *
 * Covers: registrationEnabled enforcement, maxProjectsPerUser,
 * maxTasksPerProject, maintenanceMode, task reorder length cap,
 * and team-aware document access.
 */

const { test, expect } = require('@playwright/test');
const {
  BASE_URL,
  loginAPI,
  registerAPI,
  approveUserAPI,
  createProjectAPI,
  createTaskAPI,
  createDocumentAPI,
  authHeaders,
  uniqueUser,
} = require('./helpers');

// Helper: set a global admin setting
async function setGlobalSetting(request, adminToken, key, value) {
  return request.post(`${BASE_URL}/api/admin/settings/${key}`, {
    headers: authHeaders(adminToken),
    data: { value },
  });
}

// Helper: register + approve + login a fresh user, return { token, userId, username }
async function createApprovedUser(request, adminToken, prefix = 'audit') {
  const username = uniqueUser(prefix);
  const password = 'SecurePass123!';
  const { body } = await registerAPI(request, {
    username,
    email: `${username}@test.com`,
    password,
  });
  await approveUserAPI(request, adminToken, body.user.id);
  const { token } = await loginAPI(request, { username, password });
  return { token, userId: body.user.id, username };
}

// ── Registration Control ────────────────────────────────────────────

test.describe('Registration Control (registrationEnabled)', () => {
  test('blocks registration when disabled, allows when re-enabled', async ({ request }) => {
    const { token: adminToken } = await loginAPI(request);

    // Disable registration
    await setGlobalSetting(request, adminToken, 'registrationEnabled', false);

    // Attempt to register — should be rejected
    const user = uniqueUser('regblocked');
    const blocked = await request.post(`${BASE_URL}/api/auth/register`, {
      data: { username: user, email: `${user}@test.com`, password: 'SecurePass123!' },
    });
    expect(blocked.status()).toBe(403);
    const blockedBody = await blocked.json();
    expect(blockedBody.error).toBe('Registration is currently disabled');

    // Re-enable registration
    await setGlobalSetting(request, adminToken, 'registrationEnabled', true);

    // Registration should work now
    const allowed = await request.post(`${BASE_URL}/api/auth/register`, {
      data: { username: user, email: `${user}@test.com`, password: 'SecurePass123!' },
    });
    expect(allowed.status()).toBe(201);
  });
});

// ── Max Projects Per User ───────────────────────────────────────────

test.describe('Max Projects Per User (maxProjectsPerUser)', () => {
  test('enforces project creation limit', async ({ request }) => {
    const { token: adminToken } = await loginAPI(request);
    const user = await createApprovedUser(request, adminToken, 'maxproj');

    // Set limit to 2
    await setGlobalSetting(request, adminToken, 'maxProjectsPerUser', 2);

    // Create 2 projects — both should succeed
    const { response: r1 } = await createProjectAPI(request, user.token, { title: 'Project 1' });
    expect(r1.status()).toBe(201);
    const { response: r2 } = await createProjectAPI(request, user.token, { title: 'Project 2' });
    expect(r2.status()).toBe(201);

    // 3rd project — should be blocked
    const { response: r3 } = await createProjectAPI(request, user.token, { title: 'Project 3' });
    expect(r3.status()).toBe(403);

    // Cleanup: remove limit
    await setGlobalSetting(request, adminToken, 'maxProjectsPerUser', null);
  });
});

// ── Max Tasks Per Project ───────────────────────────────────────────

test.describe('Max Tasks Per Project (maxTasksPerProject)', () => {
  test('enforces task creation limit', async ({ request }) => {
    const { token: adminToken } = await loginAPI(request);
    const user = await createApprovedUser(request, adminToken, 'maxtask');

    // Set limit to 3
    await setGlobalSetting(request, adminToken, 'maxTasksPerProject', 3);

    // Create a project
    const { body: project } = await createProjectAPI(request, user.token);

    // Create 3 tasks — all should succeed
    for (let i = 1; i <= 3; i++) {
      const { response } = await createTaskAPI(request, user.token, project.id, { title: `Task ${i}` });
      expect(response.status()).toBe(201);
    }

    // 4th task — should be blocked
    const { response: r4 } = await createTaskAPI(request, user.token, project.id, { title: 'Task 4' });
    expect(r4.status()).toBe(403);

    // Cleanup
    await setGlobalSetting(request, adminToken, 'maxTasksPerProject', null);
  });
});

// ── Maintenance Mode ────────────────────────────────────────────────

test.describe('Maintenance Mode', () => {
  test('returns 503 for normal routes but bypasses admin and health', async ({ request }) => {
    const { token: adminToken } = await loginAPI(request);

    // Enable maintenance mode
    await setGlobalSetting(request, adminToken, 'maintenanceMode', true);

    // Normal API route should be blocked
    const projects = await request.get(`${BASE_URL}/api/projects`, {
      headers: authHeaders(adminToken),
    });
    expect(projects.status()).toBe(503);

    // Health endpoint should be bypassed
    const health = await request.get(`${BASE_URL}/api/health`);
    expect(health.status()).toBe(200);

    // Admin settings endpoint should be bypassed
    const adminSettings = await request.get(`${BASE_URL}/api/admin/settings`, {
      headers: authHeaders(adminToken),
    });
    expect(adminSettings.status()).toBe(200);

    // Disable maintenance mode
    await setGlobalSetting(request, adminToken, 'maintenanceMode', false);

    // Normal route should work again
    const projectsAfter = await request.get(`${BASE_URL}/api/projects`, {
      headers: authHeaders(adminToken),
    });
    expect(projectsAfter.status()).toBe(200);
  });
});

// ── Task Reorder Length Cap ─────────────────────────────────────────

test.describe('Task Reorder Length Cap', () => {
  test('rejects reorder requests with more than 1000 items', async ({ request }) => {
    const { token: adminToken } = await loginAPI(request);
    const user = await createApprovedUser(request, adminToken, 'reorder');
    const { body: project } = await createProjectAPI(request, user.token);

    // Build a 1001-item reorder payload
    const items = Array.from({ length: 1001 }, (_, i) => ({
      id: `fake-id-${i}`,
      order: i,
    }));

    const res = await request.post(
      `${BASE_URL}/api/projects/${project.id}/tasks/reorder`,
      {
        headers: authHeaders(user.token),
        data: items,
      }
    );
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Too many items to reorder');
  });
});

// ── Team Document Access ────────────────────────────────────────────

test.describe('Team Document Access', () => {
  test('team members can access each other documents in team mode', async ({ request }) => {
    const { token: adminToken } = await loginAPI(request);

    // Create two users
    const owner = await createApprovedUser(request, adminToken, 'docowner');
    const member = await createApprovedUser(request, adminToken, 'docmember');

    // Owner creates a team and adds member
    const teamRes = await request.post(`${BASE_URL}/api/teams`, {
      headers: authHeaders(owner.token),
      data: { name: 'Doc Team' },
    });
    const { id: teamId } = await teamRes.json();

    await request.post(`${BASE_URL}/api/teams/${teamId}/members`, {
      headers: authHeaders(owner.token),
      data: { username: member.username },
    });

    // Owner creates a project with an email document
    const { body: project } = await createProjectAPI(request, owner.token, { title: 'Owner Project' });
    const { body: doc } = await createDocumentAPI(request, owner.token, project.id, {
      type: 'email',
      title: 'Test Email',
      email: { from: 'a@b.com', to: 'c@d.com', subject: 'Hi', body: 'Hello' },
    });

    // Member in team mode should see the document
    await request.post(`${BASE_URL}/api/settings/workspaceMode`, {
      headers: authHeaders(member.token),
      data: { value: 'team' },
    });

    const docsRes = await request.get(
      `${BASE_URL}/api/projects/${project.id}/documents`,
      { headers: authHeaders(member.token) }
    );
    expect(docsRes.status()).toBe(200);
    const docs = await docsRes.json();
    expect(docs.length).toBeGreaterThanOrEqual(1);
    expect(docs[0].id).toBe(doc.id);

    // Member should be able to preview the email document
    const previewRes = await request.get(
      `${BASE_URL}/api/documents/${doc.id}/preview`,
      { headers: authHeaders(member.token) }
    );
    expect(previewRes.status()).toBe(200);
    const preview = await previewRes.json();
    expect(preview.previewType).toBe('email');

    // Switch to personal mode — should lose access
    await request.post(`${BASE_URL}/api/settings/workspaceMode`, {
      headers: authHeaders(member.token),
      data: { value: 'personal' },
    });

    const personalDocsRes = await request.get(
      `${BASE_URL}/api/projects/${project.id}/documents`,
      { headers: authHeaders(member.token) }
    );
    expect(personalDocsRes.status()).toBe(404);
  });
});
