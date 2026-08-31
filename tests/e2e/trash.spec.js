const { test, expect } = require('@playwright/test');
const { BASE_URL, loginAPI, loginUI, createProjectAPI, createTaskAPI, authHeaders } = require('./helpers');

// The Trash view is the user-facing half of the soft delete. The API guarantees
// are covered by tests/project-soft-delete-migration.test.js; this file checks
// that a person can actually reach and act on a deleted project — a recovery
// window nobody can open is not a recovery window.
test.describe('Trash view', () => {

  test('deleting a project moves it out of the list and into Trash', async ({ page, request }) => {
    const { token } = await loginAPI(request);
    const { body: project } = await createProjectAPI(request, token, { title: 'Trash Me' });

    await loginUI(page);
    await page.waitForSelector('.sidebar-nav');

    // It starts life in the normal list.
    await expect(page.locator(`.project-card[data-id="${project.id}"]`)).toBeVisible();

    await request.delete(`${BASE_URL}/api/projects/${project.id}`, {
      headers: authHeaders(token),
    });
    await page.reload();
    await page.waitForSelector('.sidebar-nav');
    await expect(page.locator(`.project-card[data-id="${project.id}"]`)).toHaveCount(0);

    // And it is reachable in the Trash.
    await page.click('.nav-item[data-view="trash"]');
    const card = page.locator(`.project-card.trashed[data-id="${project.id}"]`);
    await expect(card).toBeVisible();
    await expect(card.locator('.trash-restore-btn')).toBeVisible();
    await expect(card.locator('.trash-purge-btn')).toBeVisible();
  });

  test('Restore from Trash brings the project back with its tasks intact', async ({ page, request }) => {
    const { token } = await loginAPI(request);
    const { body: project } = await createProjectAPI(request, token, { title: 'Restore Me' });
    const { body: task } = await createTaskAPI(request, token, project.id, { title: 'Keeps its id' });

    await request.delete(`${BASE_URL}/api/projects/${project.id}`, {
      headers: authHeaders(token),
    });

    await loginUI(page);
    await page.waitForSelector('.sidebar-nav');
    await page.click('.nav-item[data-view="trash"]');
    await page.click(`.project-card.trashed[data-id="${project.id}"] .trash-restore-btn`);

    await expect(page.locator('.toast', { hasText: 'Project restored' })).toBeVisible();

    // Back in the API, with the original task id — the point of a real restore.
    const res = await request.get(`${BASE_URL}/api/projects/${project.id}`, {
      headers: authHeaders(token),
    });
    expect(res.status()).toBe(200);
    const restored = await res.json();
    expect(restored.tasks).toHaveLength(1);
    expect(restored.tasks[0].id).toBe(task.id);
  });

  test('Delete forever asks for confirmation and then really removes it', async ({ page, request }) => {
    const { token } = await loginAPI(request);
    const { body: project } = await createProjectAPI(request, token, { title: 'Purge Me' });
    await request.delete(`${BASE_URL}/api/projects/${project.id}`, {
      headers: authHeaders(token),
    });

    await loginUI(page);
    await page.waitForSelector('.sidebar-nav');
    await page.click('.nav-item[data-view="trash"]');
    await page.click(`.project-card.trashed[data-id="${project.id}"] .trash-purge-btn`);

    // Destroying data must go through an explicit confirmation.
    const confirmModal = page.locator('#confirmModal');
    await expect(confirmModal).toBeVisible();
    await page.click('#confirmAction');

    await expect(page.locator(`.project-card.trashed[data-id="${project.id}"]`)).toHaveCount(0);

    // Gone from the trash listing too, not merely hidden.
    const trash = await (await request.get(`${BASE_URL}/api/projects/deleted`, {
      headers: authHeaders(token),
    })).json();
    expect(trash.projects.some(p => p.id === project.id)).toBe(false);
  });
});
