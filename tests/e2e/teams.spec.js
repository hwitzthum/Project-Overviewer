const { test, expect } = require('@playwright/test');
const { BASE_URL, loginAPI, loginUI, registerAPI, approveUserAPI, uniqueUser, authHeaders, createProjectAPI } = require('./helpers');

// Helper: create and approve a user, return their token
async function createApprovedUser(request, adminToken, prefix = 'team') {
  const name = uniqueUser(prefix);
  const { body } = await registerAPI(request, {
    username: name, email: `${name}@test.com`, password: 'SecurePass123',
  });
  await approveUserAPI(request, adminToken, body.user.id);
  const loginRes = await request.post(`${BASE_URL}/api/auth/login`, {
    data: { username: name, password: 'SecurePass123' },
  });
  const { token } = await loginRes.json();
  return { token, userId: body.user.id, username: name };
}

test.describe('Team CRUD', () => {

  test('create a team', async ({ request }) => {
    const { token: adminToken } = await loginAPI(request);
    const user = await createApprovedUser(request, adminToken);

    const res = await request.post(`${BASE_URL}/api/teams`, {
      headers: authHeaders(user.token),
      data: { name: 'Test Team' },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.name).toBe('Test Team');
  });

  test('cannot create second team while in one', async ({ request }) => {
    const { token: adminToken } = await loginAPI(request);
    const user = await createApprovedUser(request, adminToken);

    await request.post(`${BASE_URL}/api/teams`, {
      headers: authHeaders(user.token),
      data: { name: 'First Team' },
    });

    const res = await request.post(`${BASE_URL}/api/teams`, {
      headers: authHeaders(user.token),
      data: { name: 'Second Team' },
    });
    expect(res.status()).toBe(409);
  });

  test('get my team', async ({ request }) => {
    const { token: adminToken } = await loginAPI(request);
    const user = await createApprovedUser(request, adminToken);

    await request.post(`${BASE_URL}/api/teams`, {
      headers: authHeaders(user.token),
      data: { name: 'My Team' },
    });

    const res = await request.get(`${BASE_URL}/api/teams/mine`, {
      headers: authHeaders(user.token),
    });
    expect(res.status()).toBe(200);
    const team = await res.json();
    expect(team.name).toBe('My Team');
    expect(team.myRole).toBe('owner');
    expect(team.members.length).toBe(1);
  });

  test('no team returns null', async ({ request }) => {
    const { token: adminToken } = await loginAPI(request);
    const user = await createApprovedUser(request, adminToken);

    const res = await request.get(`${BASE_URL}/api/teams/mine`, {
      headers: authHeaders(user.token),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.team).toBeNull();
  });

  test('delete a team', async ({ request }) => {
    const { token: adminToken } = await loginAPI(request);
    const user = await createApprovedUser(request, adminToken);

    const createRes = await request.post(`${BASE_URL}/api/teams`, {
      headers: authHeaders(user.token),
      data: { name: 'To Delete' },
    });
    const { id: teamId } = await createRes.json();

    const delRes = await request.delete(`${BASE_URL}/api/teams/${teamId}`, {
      headers: authHeaders(user.token),
    });
    expect(delRes.status()).toBe(200);

    // Verify gone
    const mineRes = await request.get(`${BASE_URL}/api/teams/mine`, {
      headers: authHeaders(user.token),
    });
    const body = await mineRes.json();
    expect(body.team).toBeNull();
  });
});

test.describe('Team Member Management', () => {

  test('owner can add members', async ({ request }) => {
    const { token: adminToken } = await loginAPI(request);
    const owner = await createApprovedUser(request, adminToken, 'owner');
    const member = await createApprovedUser(request, adminToken, 'member');

    const createRes = await request.post(`${BASE_URL}/api/teams`, {
      headers: authHeaders(owner.token),
      data: { name: 'Team With Members' },
    });
    const { id: teamId } = await createRes.json();

    const addRes = await request.post(`${BASE_URL}/api/teams/${teamId}/members`, {
      headers: authHeaders(owner.token),
      data: { username: member.username },
    });
    expect(addRes.status()).toBe(200);

    // Verify member can see team
    const mineRes = await request.get(`${BASE_URL}/api/teams/mine`, {
      headers: authHeaders(member.token),
    });
    const team = await mineRes.json();
    expect(team.name).toBe('Team With Members');
    expect(team.myRole).toBe('member');
    expect(team.members.length).toBe(2);
  });

  test('cannot add user already in a team', async ({ request }) => {
    const { token: adminToken } = await loginAPI(request);
    const owner1 = await createApprovedUser(request, adminToken, 'own1');
    const owner2 = await createApprovedUser(request, adminToken, 'own2');

    const res1 = await request.post(`${BASE_URL}/api/teams`, {
      headers: authHeaders(owner1.token),
      data: { name: 'Team 1' },
    });
    const { id: teamId1 } = await res1.json();

    await request.post(`${BASE_URL}/api/teams`, {
      headers: authHeaders(owner2.token),
      data: { name: 'Team 2' },
    });

    // Try to add owner2 to team1
    const addRes = await request.post(`${BASE_URL}/api/teams/${teamId1}/members`, {
      headers: authHeaders(owner1.token),
      data: { username: owner2.username },
    });
    expect(addRes.status()).toBe(409);
  });

  test('member cannot add other members', async ({ request }) => {
    const { token: adminToken } = await loginAPI(request);
    const owner = await createApprovedUser(request, adminToken, 'own');
    const member = await createApprovedUser(request, adminToken, 'mem');
    const other = await createApprovedUser(request, adminToken, 'oth');

    const createRes = await request.post(`${BASE_URL}/api/teams`, {
      headers: authHeaders(owner.token),
      data: { name: 'Restricted Team' },
    });
    const { id: teamId } = await createRes.json();

    await request.post(`${BASE_URL}/api/teams/${teamId}/members`, {
      headers: authHeaders(owner.token),
      data: { username: member.username },
    });

    // Member tries to add someone
    const addRes = await request.post(`${BASE_URL}/api/teams/${teamId}/members`, {
      headers: authHeaders(member.token),
      data: { username: other.username },
    });
    expect(addRes.status()).toBe(403);
  });

  test('owner can remove members', async ({ request }) => {
    const { token: adminToken } = await loginAPI(request);
    const owner = await createApprovedUser(request, adminToken, 'own');
    const member = await createApprovedUser(request, adminToken, 'mem');

    const createRes = await request.post(`${BASE_URL}/api/teams`, {
      headers: authHeaders(owner.token),
      data: { name: 'Kick Team' },
    });
    const { id: teamId } = await createRes.json();

    await request.post(`${BASE_URL}/api/teams/${teamId}/members`, {
      headers: authHeaders(owner.token),
      data: { username: member.username },
    });

    const removeRes = await request.delete(`${BASE_URL}/api/teams/${teamId}/members/${member.userId}`, {
      headers: authHeaders(owner.token),
    });
    expect(removeRes.status()).toBe(200);

    // Verify member no longer in team
    const mineRes = await request.get(`${BASE_URL}/api/teams/mine`, {
      headers: authHeaders(member.token),
    });
    const body = await mineRes.json();
    expect(body.team).toBeNull();
  });

  test('member can leave team', async ({ request }) => {
    const { token: adminToken } = await loginAPI(request);
    const owner = await createApprovedUser(request, adminToken, 'own');
    const member = await createApprovedUser(request, adminToken, 'mem');

    const createRes = await request.post(`${BASE_URL}/api/teams`, {
      headers: authHeaders(owner.token),
      data: { name: 'Leave Team' },
    });
    const { id: teamId } = await createRes.json();

    await request.post(`${BASE_URL}/api/teams/${teamId}/members`, {
      headers: authHeaders(owner.token),
      data: { username: member.username },
    });

    const leaveRes = await request.post(`${BASE_URL}/api/teams/${teamId}/leave`, {
      headers: authHeaders(member.token),
    });
    expect(leaveRes.status()).toBe(200);
  });

  test('owner cannot leave team', async ({ request }) => {
    const { token: adminToken } = await loginAPI(request);
    const owner = await createApprovedUser(request, adminToken, 'own');

    const createRes = await request.post(`${BASE_URL}/api/teams`, {
      headers: authHeaders(owner.token),
      data: { name: 'No Leave' },
    });
    const { id: teamId } = await createRes.json();

    const leaveRes = await request.post(`${BASE_URL}/api/teams/${teamId}/leave`, {
      headers: authHeaders(owner.token),
    });
    expect(leaveRes.status()).toBe(400);
  });

  test('cannot remove team owner', async ({ request }) => {
    const { token: adminToken } = await loginAPI(request);
    const owner = await createApprovedUser(request, adminToken, 'own');
    const member = await createApprovedUser(request, adminToken, 'mem');

    const createRes = await request.post(`${BASE_URL}/api/teams`, {
      headers: authHeaders(owner.token),
      data: { name: 'Protected Team' },
    });
    const { id: teamId } = await createRes.json();

    await request.post(`${BASE_URL}/api/teams/${teamId}/members`, {
      headers: authHeaders(owner.token),
      data: { username: member.username },
    });

    // Even if we could call it, removing owner should fail
    const removeRes = await request.delete(`${BASE_URL}/api/teams/${teamId}/members/${owner.userId}`, {
      headers: authHeaders(owner.token),
    });
    expect(removeRes.status()).toBe(400);
  });

  test('non-member cannot delete team', async ({ request }) => {
    const { token: adminToken } = await loginAPI(request);
    const owner = await createApprovedUser(request, adminToken, 'own');
    const outsider = await createApprovedUser(request, adminToken, 'out');

    const createRes = await request.post(`${BASE_URL}/api/teams`, {
      headers: authHeaders(owner.token),
      data: { name: 'Not Yours' },
    });
    const { id: teamId } = await createRes.json();

    const delRes = await request.delete(`${BASE_URL}/api/teams/${teamId}`, {
      headers: authHeaders(outsider.token),
    });
    expect(delRes.status()).toBe(403);
  });
});

test.describe('Team Workspace Visibility', () => {

  test('team members see each other projects in team mode', async ({ request }) => {
    const { token: adminToken } = await loginAPI(request);
    const owner = await createApprovedUser(request, adminToken, 'own');
    const member = await createApprovedUser(request, adminToken, 'mem');

    // Create team and add member
    const createRes = await request.post(`${BASE_URL}/api/teams`, {
      headers: authHeaders(owner.token),
      data: { name: 'Visible Team' },
    });
    const { id: teamId } = await createRes.json();

    await request.post(`${BASE_URL}/api/teams/${teamId}/members`, {
      headers: authHeaders(owner.token),
      data: { username: member.username },
    });

    // Owner creates a project
    await createProjectAPI(request, owner.token, { title: 'Owner Project' });

    // Member creates a project
    await createProjectAPI(request, member.token, { title: 'Member Project' });

    // Set workspace to team mode for member (default, but explicit)
    await request.post(`${BASE_URL}/api/settings/workspaceMode`, {
      headers: authHeaders(member.token),
      data: { value: 'team' },
    });

    // Member should see both projects
    const listRes = await request.get(`${BASE_URL}/api/projects`, {
      headers: authHeaders(member.token),
    });
    const projects = await listRes.json();
    const titles = projects.map(p => p.title);
    expect(titles).toContain('Owner Project');
    expect(titles).toContain('Member Project');
  });

  test('personal mode hides team projects', async ({ request }) => {
    const { token: adminToken } = await loginAPI(request);
    const owner = await createApprovedUser(request, adminToken, 'own');
    const member = await createApprovedUser(request, adminToken, 'mem');

    const createRes = await request.post(`${BASE_URL}/api/teams`, {
      headers: authHeaders(owner.token),
      data: { name: 'Personal Team' },
    });
    const { id: teamId } = await createRes.json();

    await request.post(`${BASE_URL}/api/teams/${teamId}/members`, {
      headers: authHeaders(owner.token),
      data: { username: member.username },
    });

    // Owner creates a project
    await createProjectAPI(request, owner.token, { title: 'Secret Owner Work' });

    // Member switches to personal mode
    await request.post(`${BASE_URL}/api/settings/workspaceMode`, {
      headers: authHeaders(member.token),
      data: { value: 'personal' },
    });

    // Member should NOT see owner's project
    const listRes = await request.get(`${BASE_URL}/api/projects`, {
      headers: authHeaders(member.token),
    });
    const projects = await listRes.json();
    const found = projects.find(p => p.title === 'Secret Owner Work');
    expect(found).toBeUndefined();
  });

  test('team mode does not allow cross-team writes', async ({ request }) => {
    const { token: adminToken } = await loginAPI(request);
    const owner = await createApprovedUser(request, adminToken, 'own');
    const member = await createApprovedUser(request, adminToken, 'mem');

    const createRes = await request.post(`${BASE_URL}/api/teams`, {
      headers: authHeaders(owner.token),
      data: { name: 'Write Isolation' },
    });
    const { id: teamId } = await createRes.json();

    await request.post(`${BASE_URL}/api/teams/${teamId}/members`, {
      headers: authHeaders(owner.token),
      data: { username: member.username },
    });

    // Owner creates a project
    const { body: project } = await createProjectAPI(request, owner.token, { title: 'Read Only' });

    // Member tries to update owner's project — should fail (write ops are user-scoped)
    const updateRes = await request.put(`${BASE_URL}/api/projects/${project.id}`, {
      headers: authHeaders(member.token),
      data: { title: 'Hacked' },
    });
    expect(updateRes.status()).toBe(404); // Not found because writes are user-scoped

    // Member tries to delete owner's project — should fail
    const deleteRes = await request.delete(`${BASE_URL}/api/projects/${project.id}`, {
      headers: authHeaders(member.token),
    });
    expect(deleteRes.status()).toBe(404);
  });

  test('non-team users only see own projects', async ({ request }) => {
    const { token: adminToken } = await loginAPI(request);
    const userA = await createApprovedUser(request, adminToken, 'solo');

    // No team — workspace mode is team by default but getTeamUserIds returns [userId]
    await createProjectAPI(request, userA.token, { title: 'Solo Project' });

    const listRes = await request.get(`${BASE_URL}/api/projects`, {
      headers: authHeaders(userA.token),
    });
    const projects = await listRes.json();
    expect(projects.length).toBe(1);
    expect(projects[0].title).toBe('Solo Project');
  });
});

test.describe('UI: Workspace Toggle', () => {

  test('workspace toggle is visible after login', async ({ page }) => {
    // Login as admin
    await page.goto('/login.html');
    await page.fill('#username', 'testadmin');
    await page.fill('#password', 'SecureTestPass123');
    await page.click('#submitBtn');
    await page.waitForURL(/\/(?:index\.html)?$/, { timeout: 5000 });

    // Toggle should be visible
    await expect(page.locator('#workspaceToggle')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.workspace-toggle-btn[data-mode="team"]')).toBeVisible();
    await expect(page.locator('.workspace-toggle-btn[data-mode="personal"]')).toBeVisible();
  });

  test('team section visible in settings', async ({ page }) => {
    await page.goto('/login.html');
    await page.fill('#username', 'testadmin');
    await page.fill('#password', 'SecureTestPass123');
    await page.click('#submitBtn');
    await page.waitForURL(/\/(?:index\.html)?$/, { timeout: 5000 });

    // Open settings
    await page.click('#openSettings');
    await expect(page.locator('#teamSection')).toBeVisible({ timeout: 3000 });
  });

  test('team project cards show creator usernames', async ({ request, page }) => {
    const { token: adminToken } = await loginAPI(request);
    const owner = await createApprovedUser(request, adminToken, 'ownerui');
    const member = await createApprovedUser(request, adminToken, 'memberui');

    const createRes = await request.post(`${BASE_URL}/api/teams`, {
      headers: authHeaders(owner.token),
      data: { name: 'Owner Labels' },
    });
    const { id: teamId } = await createRes.json();

    await request.post(`${BASE_URL}/api/teams/${teamId}/members`, {
      headers: authHeaders(owner.token),
      data: { username: member.username },
    });

    await createProjectAPI(request, owner.token, { title: 'Owner Label Project' });
    await createProjectAPI(request, member.token, { title: 'Member Label Project' });
    await request.post(`${BASE_URL}/api/settings/workspaceMode`, {
      headers: authHeaders(member.token),
      data: { value: 'team' },
    });

    await loginUI(page, { username: member.username, password: 'SecurePass123' });
    await page.waitForURL(/\/(?:index\.html)?$/, { timeout: 5000 });

    const ownerCard = page.locator('.project-card').filter({
      has: page.locator('input.project-title[value="Owner Label Project"]')
    }).first();
    const memberCard = page.locator('.project-card').filter({
      has: page.locator('input.project-title[value="Member Label Project"]')
    }).first();

    await expect(ownerCard).toContainText(owner.username);
    await expect(memberCard).toContainText(member.username);
  });
});
