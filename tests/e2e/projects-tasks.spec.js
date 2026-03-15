const { test, expect } = require('@playwright/test');
const { BASE_URL, loginAPI, loginUI, createProjectAPI, createTaskAPI, createDocumentAPI, authHeaders, registerAPI, approveUserAPI, uniqueUser } = require('./helpers');

const PREVIEW_FIXTURE_DOCX_BASE64 = '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';

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
