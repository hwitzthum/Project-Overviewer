const { test, expect } = require('@playwright/test');
const { BASE_URL, loginAPI, loginUI, createProjectAPI, createTaskAPI, createDocumentAPI, authHeaders, registerAPI, approveUserAPI, uniqueUser } = require('./helpers');

const PREVIEW_FIXTURE_DOCX_BASE64 = 'UEsDBBQAAAAAAAAAAADGEnoH8QAAAPEAAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbDw/eG1sIHZlcnNpb249IjEuMCI/PjxUeXBlcyB4bWxucz0iaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL3BhY2thZ2UvMjAwNi9jb250ZW50LXR5cGVzIj48T3ZlcnJpZGUgUGFydE5hbWU9Ii93b3JkL2RvY3VtZW50LnhtbCIgQ29udGVudFR5cGU9ImFwcGxpY2F0aW9uL3ZuZC5vcGVueG1sZm9ybWF0cy1vZmZpY2Vkb2N1bWVudC53b3JkcHJvY2Vzc2luZ21sLmRvY3VtZW50Lm1haW4reG1sIi8+PC9UeXBlcz5QSwMEFAAAAAAAAAAAAF8zlVIHAQAABwEAAAsAAABfcmVscy8ucmVsczw/eG1sIHZlcnNpb249IjEuMCI/PjxSZWxhdGlvbnNoaXBzIHhtbG5zPSJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvcGFja2FnZS8yMDA2L3JlbGF0aW9uc2hpcHMiPjxSZWxhdGlvbnNoaXAgSWQ9InJJZDEiIFR5cGU9Imh0dHA6Ly9zY2hlbWFzLm9wZW54bWxmb3JtYXRzLm9yZy9vZmZpY2VEb2N1bWVudC8yMDA2L3JlbGF0aW9uc2hpcHMvb2ZmaWNlRG9jdW1lbnQiIFRhcmdldD0id29yZC9kb2N1bWVudC54bWwiLz48L1JlbGF0aW9uc2hpcHM+UEsDBBQAAAAAAAAAAADNz35OAAEAAAABAAARAAAAd29yZC9kb2N1bWVudC54bWw8P3htbCB2ZXJzaW9uPSIxLjAiPz48dzpkb2N1bWVudCB4bWxuczp3PSJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvd29yZHByb2Nlc3NpbmdtbC8yMDA2L21haW4iPjx3OmJvZHk+PHc6cD48dzpyPjx3OnQ+UHJldmlldyBmaXh0dXJlIGRvY3VtZW50PC93OnQ+PC93OnI+PC93OnA+PHc6cD48dzpyPjx3OnQ+U2Vjb25kIGxpbmUgZm9yIGlubGluZSBvcGVuIHRlc3Q8L3c6dD48L3c6cj48L3c6cD48L3c6Ym9keT48L3c6ZG9jdW1lbnQ+UEsBAhQAFAAAAAAAAAAAAMYSegfxAAAA8QAAABMAAAAAAAAAAAAAAAAAAAAAAFtDb250ZW50X1R5cGVzXS54bWxQSwECFAAUAAAAAAAAAAAAXzOVUgcBAAAHAQAACwAAAAAAAAAAAAAAAAAiAQAAX3JlbHMvLnJlbHNQSwECFAAUAAAAAAAAAAAAzc9+TgABAAAAAQAAEQAAAAAAAAAAAAAAAABSAgAAd29yZC9kb2N1bWVudC54bWxQSwUGAAAAAAMAAwC5AAAAgQMAAAAA';

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

  test('preview email and document attachments', async ({ request }) => {
    const { token } = await loginAPI(request);
    const { body: project } = await createProjectAPI(request, token, { title: 'Preview API' });

    const { response: emailRes, body: emailBody } = await createDocumentAPI(request, token, project.id, {
      type: 'email',
      title: 'Status Email',
      email: {
        subject: 'Status update',
        from: 'pm@example.com',
        to: 'team@example.com',
        date: '2026-03-14',
        body: 'Email preview body'
      }
    });
    expect(emailRes.status()).toBe(201);

    const emailPreviewRes = await request.get(`${BASE_URL}/api/documents/${emailBody.id}/preview`, {
      headers: authHeaders(token),
    });
    expect(emailPreviewRes.status()).toBe(200);
    const emailPreview = await emailPreviewRes.json();
    expect(emailPreview.previewType).toBe('email');
    expect(emailPreview.email.body).toContain('Email preview body');

    const { response: docRes, body: docBody } = await createDocumentAPI(request, token, project.id, {
      type: 'docx',
      title: 'Fixture Document',
      fileName: 'fixture.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      contentBase64: PREVIEW_FIXTURE_DOCX_BASE64
    });
    expect(docRes.status()).toBe(201);

    const docPreviewRes = await request.get(`${BASE_URL}/api/documents/${docBody.id}/preview`, {
      headers: authHeaders(token),
    });
    expect(docPreviewRes.status()).toBe(200);
    const docPreview = await docPreviewRes.json();
    expect(docPreview.previewType).toBe('text');
    expect(docPreview.text).toContain('Preview fixture document');
    expect(docPreview.text).toContain('Second line for inline open test');
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

  test('open document renders inline preview in the project view', async ({ request, page }) => {
    const { token } = await loginAPI(request);
    const title = `Preview Home ${Date.now()}`;
    const { body: project } = await createProjectAPI(request, token, { title });
    const { response } = await createDocumentAPI(request, token, project.id, {
      type: 'docx',
      title: 'Fixture Document',
      fileName: 'fixture.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      contentBase64: PREVIEW_FIXTURE_DOCX_BASE64
    });
    expect(response.status()).toBe(201);

    await loginUI(page);
    await page.waitForSelector('#newProject');

    const card = page.locator('.project-card').filter({
      has: page.locator(`input.project-title[value="${title}"]`)
    }).first();
    await card.locator('.doc-manage').click();

    const openButton = page.locator('.doc-item [data-doc-action="open"]').first();
    await openButton.click();

    const preview = page.locator('.doc-preview-text').first();
    await expect(preview).toContainText('Preview fixture document');
    await expect(preview).toContainText('Second line for inline open test');
    await expect(openButton).toHaveText('Close');
  });

  test('document persists when a stale poll resolves after attachment and sidebar navigation', async ({ request, page }) => {
    const { token } = await loginAPI(request);
    const title = `Polling Doc ${Date.now()}`;
    const { body: project } = await createProjectAPI(request, token, { title });

    const staleProjectsRes = await request.get(`${BASE_URL}/api/projects`, {
      headers: authHeaders(token),
    });
    expect(staleProjectsRes.status()).toBe(200);
    const staleProjects = await staleProjectsRes.json();

    await loginUI(page);
    await page.waitForSelector('#newProject');

    await expect(page.locator('.project-card').filter({
      has: page.locator(`input.project-title[value="${title}"]`)
    }).first()).toBeVisible();
    await page.evaluate(projectId => {
      openProjectHome(projectId);
    }, project.id);
    await page.waitForSelector('#projectHomeDocuments');

    let intercepted = false;
    let releaseProjectsResponse;
    const projectsResponseGate = new Promise(resolve => {
      releaseProjectsResponse = resolve;
    });
    const projectsRoute = async route => {
      if (intercepted) {
        await route.continue();
        return;
      }
      intercepted = true;
      await projectsResponseGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(staleProjects)
      });
      await page.unroute('**/api/v1/projects', projectsRoute);
    };
    await page.route('**/api/v1/projects', projectsRoute);

    const pollPromise = page.evaluate(() => runAppPollingCycle());
    await expect.poll(() => intercepted).toBe(true);

    await page.evaluate(async ({ projectId, contentBase64 }) => {
      await API.createDocument(projectId, {
        type: 'docx',
        title: 'fixture.docx',
        fileName: 'fixture.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        contentBase64
      });
      await refreshProjectDocuments(projectId);
    }, { projectId: project.id, contentBase64: PREVIEW_FIXTURE_DOCX_BASE64 });

    await expect(page.locator('#projectHomeDocuments .doc-item')).toHaveCount(1);
    await expect(page.locator('#projectHomeDocuments')).toContainText('fixture.docx');

    releaseProjectsResponse();
    await pollPromise;

    await page.click('.nav-item[data-view="kanban"]');
    await page.click('.nav-item[data-view="all"]');
    await page.evaluate(projectId => {
      openProjectHome(projectId);
    }, project.id);

    await expect(page.locator('#projectHomeDocuments .doc-item')).toHaveCount(1);
    await expect(page.locator('#projectHomeDocuments')).toContainText('fixture.docx');
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
