const { test, expect } = require('@playwright/test');
const { BASE_URL, loginAPI, loginUI, registerAPI, approveUserAPI, authHeaders, createProjectAPI, uniqueUser } = require('./helpers');

const USER_PASSWORD = 'SecurePass123';

async function createApprovedUser(request, adminToken, prefix = 'user') {
  const username = uniqueUser(prefix);
  const { body } = await registerAPI(request, {
    username,
    email: `${username}@test.com`,
    password: USER_PASSWORD,
  });
  await approveUserAPI(request, adminToken, body.user.id);

  const loginRes = await request.post(`${BASE_URL}/api/auth/login`, {
    data: { username, password: USER_PASSWORD },
  });
  const { token } = await loginRes.json();
  return { username, token, userId: body.user.id };
}

async function getProjectsByTitleInBrowser(page, title) {
  return page.evaluate(async (projectTitle) => {
    const res = await fetch('/api/v1/projects');
    const projects = await res.json();
    return projects.filter(project => project.title === projectTitle).length;
  }, title);
}

test.describe('Red-Team Fixes', () => {
  test('tag payload is rendered as data, not executable attributes', async ({ request, page }) => {
    const { token } = await loginAPI(request);
    const title = `safe-tags-${Date.now()}`;
    const payload = 'x" onfocus="window.__redTeam=1" data-owned="1';

    await createProjectAPI(request, token, {
      title,
      tags: [payload],
    });

    await loginUI(page);
    await page.waitForSelector('#newProject');

    const card = page.locator('.project-card').filter({
      has: page.locator(`input.project-title[value="${title}"]`)
    }).first();
    await card.click();

    const homeTags = page.locator('.project-home-field[data-field="tags"]');
    await expect(homeTags).toHaveValue(payload);
    expect(await homeTags.getAttribute('onfocus')).toBeNull();
    expect(await homeTags.getAttribute('data-owned')).toBeNull();

    await page.click('[data-project-action="quick-edit"]');
    const modalTags = page.locator('#editTags');
    await expect(modalTags).toHaveValue(payload);
    expect(await modalTags.getAttribute('onfocus')).toBeNull();
    expect(await modalTags.getAttribute('data-owned')).toBeNull();
  });

  test('rapid create-project clicks only create one project', async ({ page }) => {
    await loginUI(page);
    await page.waitForSelector('#newProject');

    const title = `single-create-${Date.now()}`;
    await page.click('#newProject');
    await page.fill('#createTitle', title);

    await page.evaluate(() => {
      const submit = document.getElementById('createProjectSubmit');
      for (let i = 0; i < 5; i += 1) {
        submit.click();
      }
    });

    await expect.poll(() => getProjectsByTitleInBrowser(page, title)).toBe(1);
  });

  test('workspace toggle settles on the latest selection after fast clicks', async ({ request, page }) => {
    const { token: adminToken } = await loginAPI(request);
    const owner = await createApprovedUser(request, adminToken, 'toggleOwner');
    const member = await createApprovedUser(request, adminToken, 'toggleMember');

    const teamRes = await request.post(`${BASE_URL}/api/teams`, {
      headers: authHeaders(owner.token),
      data: { name: 'Toggle Team' },
    });
    const { id: teamId } = await teamRes.json();

    await request.post(`${BASE_URL}/api/teams/${teamId}/members`, {
      headers: authHeaders(owner.token),
      data: { username: member.username },
    });

    await createProjectAPI(request, owner.token, { title: 'owner-team-project' });
    await createProjectAPI(request, member.token, { title: 'member-team-project' });
    await request.post(`${BASE_URL}/api/settings/workspaceMode`, {
      headers: authHeaders(owner.token),
      data: { value: 'team' },
    });

    await page.route('**/api/v1/settings/workspaceMode', async route => {
      const payload = route.request().postDataJSON?.();
      if (route.request().method() === 'POST' && payload?.value === 'personal') {
        await new Promise(resolve => setTimeout(resolve, 700));
      }
      await route.continue();
    });

    await loginUI(page, { username: owner.username, password: USER_PASSWORD });
    await page.waitForSelector('#newProject');

    await expect.poll(async () => {
      const titles = await page.locator('.project-card .project-title').evaluateAll(nodes =>
        nodes.map(node => node.value).sort()
      );
      return titles;
    }).toEqual(['member-team-project', 'owner-team-project']);

    await page.click('.workspace-toggle-btn[data-mode="personal"]');
    await page.waitForTimeout(50);
    await page.click('.workspace-toggle-btn[data-mode="team"]');

    await expect.poll(async () => {
      const activeMode = await page.locator('.workspace-toggle-btn.active').getAttribute('data-mode');
      const titles = await page.locator('.project-card .project-title').evaluateAll(nodes =>
        nodes.map(node => node.value).sort()
      );
      return { activeMode, titles };
    }).toEqual({
      activeMode: 'team',
      titles: ['member-team-project', 'owner-team-project']
    });
  });

  test('rapid create-team clicks only submit once from the UI', async ({ request, page }) => {
    const { token: adminToken } = await loginAPI(request);
    const owner = await createApprovedUser(request, adminToken, 'rapidTeamOwner');
    let createTeamRequests = 0;

    await page.route('**/api/v1/teams', async route => {
      if (route.request().method() === 'POST') {
        createTeamRequests += 1;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      await route.continue();
    });

    await loginUI(page, { username: owner.username, password: USER_PASSWORD });
    await page.waitForSelector('#newProject');
    await page.click('#openSettings');
    await page.waitForSelector('#teamContent input[placeholder="Team name"]');

    await page.fill('#teamContent input[placeholder="Team name"]', 'Rapid Team');
    await page.evaluate(() => {
      const createBtn = Array.from(document.querySelectorAll('#teamContent button'))
        .find(button => button.textContent?.trim() === 'Create Team');
      for (let i = 0; i < 5; i += 1) {
        createBtn?.click();
      }
    });

    await expect.poll(() => createTeamRequests).toBe(1);
    await expect(page.locator('#teamContent')).toContainText('Rapid Team');
  });

  test('concurrent create-team requests cannot create multiple teams for the same user', async ({ request }) => {
    const { token: adminToken } = await loginAPI(request);
    const owner = await createApprovedUser(request, adminToken, 'teamRaceOwner');

    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, index) => request.post(`${BASE_URL}/api/teams`, {
        headers: authHeaders(owner.token),
        data: { name: `Race Team ${index}` },
      }))
    );

    const statuses = responses.map(response => response.status()).sort((a, b) => a - b);
    expect(statuses.filter(status => status === 201)).toHaveLength(1);
    expect(statuses.filter(status => status === 409)).toHaveLength(5);
  });

  test('concurrent invites cannot add the same user to multiple teams', async ({ request }) => {
    const { token: adminToken } = await loginAPI(request);
    const ownerA = await createApprovedUser(request, adminToken, 'ownerA');
    const ownerB = await createApprovedUser(request, adminToken, 'ownerB');
    const victim = await createApprovedUser(request, adminToken, 'victim');

    const [teamARes, teamBRes] = await Promise.all([
      request.post(`${BASE_URL}/api/teams`, {
        headers: authHeaders(ownerA.token),
        data: { name: 'Alpha Team' },
      }),
      request.post(`${BASE_URL}/api/teams`, {
        headers: authHeaders(ownerB.token),
        data: { name: 'Beta Team' },
      }),
    ]);

    const teamA = await teamARes.json();
    const teamB = await teamBRes.json();

    const inviteResponses = await Promise.all([
      request.post(`${BASE_URL}/api/teams/${teamA.id}/members`, {
        headers: authHeaders(ownerA.token),
        data: { username: victim.username },
      }),
      request.post(`${BASE_URL}/api/teams/${teamB.id}/members`, {
        headers: authHeaders(ownerB.token),
        data: { username: victim.username },
      }),
    ]);

    const statuses = inviteResponses.map(response => response.status()).sort((a, b) => a - b);
    expect(statuses.filter(status => status === 200)).toHaveLength(1);
    expect(statuses.filter(status => status === 409)).toHaveLength(1);
  });
});
