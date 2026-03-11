const { test, expect } = require('@playwright/test');
const { BASE_URL, loginAPI, createProjectAPI, createTaskAPI, authHeaders, registerAPI, approveUserAPI, uniqueUser } = require('./helpers');

test.describe('Projects & Tasks CRUD', () => {

  // ─── Projects ───────────────────────────────────────────────

  test('create a project', async ({ request }) => {
    const { token } = await loginAPI(request);
    const { response, body } = await createProjectAPI(request, token, {
      title: 'E2E Project',
      status: 'in-progress',
      priority: 'high',
      tags: ['e2e', 'test'],
    });
    expect(response.status()).toBe(201);
    expect(body.id).toBeTruthy();
    expect(body.title).toBe('E2E Project');
  });

  test('list projects', async ({ request }) => {
    const { token } = await loginAPI(request);
    const res = await request.get(`${BASE_URL}/api/projects`, {
      headers: authHeaders(token),
    });
    expect(res.status()).toBe(200);
    const projects = await res.json();
    expect(Array.isArray(projects)).toBe(true);
  });

  test('get single project', async ({ request }) => {
    const { token } = await loginAPI(request);
    const { body: created } = await createProjectAPI(request, token, { title: 'Single Get' });
    const res = await request.get(`${BASE_URL}/api/projects/${created.id}`, {
      headers: authHeaders(token),
    });
    expect(res.status()).toBe(200);
    const project = await res.json();
    expect(project.title).toBe('Single Get');
  });

  test('update a project', async ({ request }) => {
    const { token } = await loginAPI(request);
    const { body: created } = await createProjectAPI(request, token, { title: 'Before Update' });
    const res = await request.put(`${BASE_URL}/api/projects/${created.id}`, {
      headers: authHeaders(token),
      data: { title: 'After Update', status: 'completed' },
    });
    expect(res.status()).toBe(200);
    const updated = await res.json();
    expect(updated.title).toBe('After Update');
    expect(updated.status).toBe('completed');
  });

  test('delete a project', async ({ request }) => {
    const { token } = await loginAPI(request);
    const { body: created } = await createProjectAPI(request, token, { title: 'To Delete' });
    const delRes = await request.delete(`${BASE_URL}/api/projects/${created.id}`, {
      headers: authHeaders(token),
    });
    expect(delRes.status()).toBe(200);

    const getRes = await request.get(`${BASE_URL}/api/projects/${created.id}`, {
      headers: authHeaders(token),
    });
    expect(getRes.status()).toBe(404);
  });

  test('reject project with empty title', async ({ request }) => {
    const { token } = await loginAPI(request);
    const res = await request.post(`${BASE_URL}/api/projects`, {
      headers: authHeaders(token),
      data: { title: '' },
    });
    expect(res.status()).toBe(400);
  });

  test('reject project with missing title', async ({ request }) => {
    const { token } = await loginAPI(request);
    const res = await request.post(`${BASE_URL}/api/projects`, {
      headers: authHeaders(token),
      data: { status: 'not-started' },
    });
    expect(res.status()).toBe(400);
  });

  test('404 for non-existent project', async ({ request }) => {
    const { token } = await loginAPI(request);
    const res = await request.get(`${BASE_URL}/api/projects/00000000-0000-0000-0000-000000000000`, {
      headers: authHeaders(token),
    });
    expect(res.status()).toBe(404);
  });

  // ─── Tasks ──────────────────────────────────────────────────

  test('create a task', async ({ request }) => {
    const { token } = await loginAPI(request);
    const { body: project } = await createProjectAPI(request, token);
    const { response, body } = await createTaskAPI(request, token, project.id, {
      title: 'E2E Task',
      priority: 'high',
    });
    expect(response.status()).toBe(201);
    expect(body.id).toBeTruthy();
  });

  test('list tasks for a project', async ({ request }) => {
    const { token } = await loginAPI(request);
    const { body: project } = await createProjectAPI(request, token);
    await createTaskAPI(request, token, project.id, { title: 'Task 1' });
    await createTaskAPI(request, token, project.id, { title: 'Task 2' });

    const res = await request.get(`${BASE_URL}/api/projects/${project.id}/tasks`, {
      headers: authHeaders(token),
    });
    expect(res.status()).toBe(200);
    const tasks = await res.json();
    expect(tasks.length).toBe(2);
  });

  test('update a task', async ({ request }) => {
    const { token } = await loginAPI(request);
    const { body: project } = await createProjectAPI(request, token);
    const { body: task } = await createTaskAPI(request, token, project.id, { title: 'Before' });

    const res = await request.put(`${BASE_URL}/api/tasks/${task.id}`, {
      headers: authHeaders(token),
      data: { title: 'After', completed: true },
    });
    expect(res.status()).toBe(200);
  });

  test('delete a task', async ({ request }) => {
    const { token } = await loginAPI(request);
    const { body: project } = await createProjectAPI(request, token);
    const { body: task } = await createTaskAPI(request, token, project.id);

    const delRes = await request.delete(`${BASE_URL}/api/tasks/${task.id}`, {
      headers: authHeaders(token),
    });
    expect(delRes.status()).toBe(200);

    const listRes = await request.get(`${BASE_URL}/api/projects/${project.id}/tasks`, {
      headers: authHeaders(token),
    });
    const tasks = await listRes.json();
    expect(tasks.length).toBe(0);
  });

  test('deleting a project cascades to its tasks', async ({ request }) => {
    const { token } = await loginAPI(request);
    const { body: project } = await createProjectAPI(request, token);
    const { body: task } = await createTaskAPI(request, token, project.id, { title: 'Cascade Me' });

    await request.delete(`${BASE_URL}/api/projects/${project.id}`, {
      headers: authHeaders(token),
    });

    const taskRes = await request.delete(`${BASE_URL}/api/tasks/${task.id}`, {
      headers: authHeaders(token),
    });
    expect(taskRes.status()).toBe(404);
  });

  test('reject task with empty title', async ({ request }) => {
    const { token } = await loginAPI(request);
    const { body: project } = await createProjectAPI(request, token);
    const res = await request.post(`${BASE_URL}/api/projects/${project.id}/tasks`, {
      headers: authHeaders(token),
      data: { title: '' },
    });
    expect(res.status()).toBe(400);
  });

  test('reject task for non-existent project', async ({ request }) => {
    const { token } = await loginAPI(request);
    const res = await request.post(`${BASE_URL}/api/projects/00000000-0000-0000-0000-000000000000/tasks`, {
      headers: authHeaders(token),
      data: { title: 'Orphan Task' },
    });
    expect(res.status()).toBe(404);
  });
});

test.describe('Data Isolation', () => {

  async function setupTwoUsers(request) {
    const userA = uniqueUser('isolA');
    const userB = uniqueUser('isolB');

    const { body: regA } = await registerAPI(request, { username: userA, email: `${userA}@test.com`, password: 'SecurePass123' });
    const { body: regB } = await registerAPI(request, { username: userB, email: `${userB}@test.com`, password: 'SecurePass123' });

    const { token: adminToken } = await loginAPI(request);
    await approveUserAPI(request, adminToken, regA.user.id);
    await approveUserAPI(request, adminToken, regB.user.id);

    const loginA = await request.post(`${BASE_URL}/api/auth/login`, { data: { username: userA, password: 'SecurePass123' } });
    const { token: tokenA } = await loginA.json();
    const loginB = await request.post(`${BASE_URL}/api/auth/login`, { data: { username: userB, password: 'SecurePass123' } });
    const { token: tokenB } = await loginB.json();

    return { tokenA, tokenB };
  }

  test('user A cannot see user B projects', async ({ request }) => {
    const { tokenA, tokenB } = await setupTwoUsers(request);

    const { body: projectA } = await createProjectAPI(request, tokenA, { title: 'User A Secret' });

    const listRes = await request.get(`${BASE_URL}/api/projects`, {
      headers: authHeaders(tokenB),
    });
    const projects = await listRes.json();
    const found = projects.find(p => p.title === 'User A Secret');
    expect(found).toBeUndefined();

    const directRes = await request.get(`${BASE_URL}/api/projects/${projectA.id}`, {
      headers: authHeaders(tokenB),
    });
    expect(directRes.status()).toBe(404);
  });

  test('user A cannot modify user B project', async ({ request }) => {
    const { tokenA, tokenB } = await setupTwoUsers(request);

    const { body: projectA } = await createProjectAPI(request, tokenA, { title: 'A Only' });

    const updateRes = await request.put(`${BASE_URL}/api/projects/${projectA.id}`, {
      headers: authHeaders(tokenB),
      data: { title: 'Hacked' },
    });
    expect(updateRes.status()).toBe(404);

    const deleteRes = await request.delete(`${BASE_URL}/api/projects/${projectA.id}`, {
      headers: authHeaders(tokenB),
    });
    expect(deleteRes.status()).toBe(404);
  });
});