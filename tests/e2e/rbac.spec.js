const { test, expect } = require('@playwright/test');
const { BASE_URL, ADMIN, loginAPI, loginUI, registerAPI, approveUserAPI, uniqueUser, authHeaders, adminStepUpPayload } = require('./helpers');

test.describe('Role-Based Access Control', () => {

  // Each test gets its own tokens by calling loginAPI inline
  // This avoids the beforeAll + request fixture incompatibility

  async function setupUserAndAdmin(request) {
    const { token: adminToken } = await loginAPI(request);
    const user = uniqueUser('rbac');
    const { body } = await registerAPI(request, {
      username: user, email: `${user}@test.com`, password: 'SecurePass123',
    });
    const userId = body.user.id;
    await approveUserAPI(request, adminToken, userId);

    const loginRes = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { username: user, password: 'SecurePass123' },
    });
    const { token: userToken } = await loginRes.json();
    return { adminToken, userToken, userId };
  }

  // ─── Admin Endpoints Blocked for Regular Users ──────────────

  test('regular user cannot list all users', async ({ request }) => {
    const { userToken } = await setupUserAndAdmin(request);
    const res = await request.get(`${BASE_URL}/api/admin/users`, {
      headers: authHeaders(userToken),
    });
    expect(res.status()).toBe(403);
  });

  test('regular user cannot approve users', async ({ request }) => {
    const { userToken, userId } = await setupUserAndAdmin(request);
    const res = await request.put(`${BASE_URL}/api/admin/users/${userId}/approve`, {
      headers: authHeaders(userToken),
      data: adminStepUpPayload(),
    });
    expect(res.status()).toBe(403);
  });

  test('regular user cannot change roles', async ({ request }) => {
    const { userToken, userId } = await setupUserAndAdmin(request);
    const res = await request.put(`${BASE_URL}/api/admin/users/${userId}/role`, {
      headers: authHeaders(userToken),
      data: adminStepUpPayload({ role: 'admin' }),
    });
    expect(res.status()).toBe(403);
  });

  test('regular user cannot delete users', async ({ request }) => {
    const { userToken, userId } = await setupUserAndAdmin(request);
    const res = await request.delete(`${BASE_URL}/api/admin/users/${userId}`, {
      headers: authHeaders(userToken),
      data: adminStepUpPayload(),
    });
    expect(res.status()).toBe(403);
  });

  test('regular user cannot access global settings', async ({ request }) => {
    const { userToken } = await setupUserAndAdmin(request);
    const res = await request.get(`${BASE_URL}/api/admin/settings`, {
      headers: authHeaders(userToken),
    });
    expect(res.status()).toBe(403);
  });

  test('regular user cannot set global settings', async ({ request }) => {
    const { userToken } = await setupUserAndAdmin(request);
    const res = await request.post(`${BASE_URL}/api/admin/settings/siteName`, {
      headers: authHeaders(userToken),
      data: { value: 'Hacked' },
    });
    expect(res.status()).toBe(403);
  });

  // ─── Admin Can Access Admin Endpoints ───────────────────────

  test('admin can list all users', async ({ request }) => {
    const { adminToken } = await setupUserAndAdmin(request);
    const res = await request.get(`${BASE_URL}/api/admin/users`, {
      headers: authHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const users = await res.json();
    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBeGreaterThan(0);
  });

  test('admin can change user role', async ({ request }) => {
    const { adminToken } = await setupUserAndAdmin(request);
    const tempUser = uniqueUser('roletest');
    const { body } = await registerAPI(request, {
      username: tempUser, email: `${tempUser}@test.com`, password: 'SecurePass123',
    });
    await approveUserAPI(request, adminToken, body.user.id);

    const res = await request.put(`${BASE_URL}/api/admin/users/${body.user.id}/role`, {
      headers: authHeaders(adminToken),
      data: adminStepUpPayload({ role: 'admin' }),
    });
    expect(res.status()).toBe(200);
  });

  test('admin cannot demote themselves', async ({ request }) => {
    const { adminToken } = await setupUserAndAdmin(request);
    const me = await request.get(`${BASE_URL}/api/auth/me`, {
      headers: authHeaders(adminToken),
    });
    const { id: adminId } = await me.json();

    const res = await request.put(`${BASE_URL}/api/admin/users/${adminId}/role`, {
      headers: authHeaders(adminToken),
      data: adminStepUpPayload({ role: 'user' }),
    });
    expect(res.status()).toBe(400);
  });

  test('admin cannot delete themselves', async ({ request }) => {
    const { adminToken } = await setupUserAndAdmin(request);
    const me = await request.get(`${BASE_URL}/api/auth/me`, {
      headers: authHeaders(adminToken),
    });
    const { id: adminId } = await me.json();

    const res = await request.delete(`${BASE_URL}/api/admin/users/${adminId}`, {
      headers: authHeaders(adminToken),
      data: adminStepUpPayload(),
    });
    expect(res.status()).toBe(400);
  });

  test('admin can delete a user', async ({ request }) => {
    const { adminToken } = await setupUserAndAdmin(request);
    const tempUser = uniqueUser('deltest');
    const { body } = await registerAPI(request, {
      username: tempUser, email: `${tempUser}@test.com`, password: 'SecurePass123',
    });

    const res = await request.delete(`${BASE_URL}/api/admin/users/${body.user.id}`, {
      headers: authHeaders(adminToken),
      data: adminStepUpPayload(),
    });
    expect(res.status()).toBe(200);
  });

  test('reject invalid role value', async ({ request }) => {
    const { adminToken } = await setupUserAndAdmin(request);
    const tempUser = uniqueUser('badrole');
    const { body } = await registerAPI(request, {
      username: tempUser, email: `${tempUser}@test.com`, password: 'SecurePass123',
    });

    const res = await request.put(`${BASE_URL}/api/admin/users/${body.user.id}/role`, {
      headers: authHeaders(adminToken),
      data: adminStepUpPayload({ role: 'superadmin' }),
    });
    expect(res.status()).toBe(400);
  });

  // ─── User-Existence Checks (Hardening) ─────────────────────

  test('approve returns 404 for non-existent user', async ({ request }) => {
    const { adminToken } = await setupUserAndAdmin(request);
    const res = await request.put(`${BASE_URL}/api/admin/users/non-existent-id/approve`, {
      headers: authHeaders(adminToken),
      data: adminStepUpPayload(),
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('User not found');
  });

  test('role change returns 404 for non-existent user', async ({ request }) => {
    const { adminToken } = await setupUserAndAdmin(request);
    const res = await request.put(`${BASE_URL}/api/admin/users/non-existent-id/role`, {
      headers: authHeaders(adminToken),
      data: adminStepUpPayload({ role: 'admin' }),
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('User not found');
  });

  // ─── Full Admin Panel Workflow (E2E) ──────────────────────

  test('full workflow: register → admin approves → user can login', async ({ request }) => {
    // 1. Admin logs in
    const { token: adminToken } = await loginAPI(request);

    // 2. New user registers
    const newUser = uniqueUser('workflow');
    const { body: regBody } = await registerAPI(request, {
      username: newUser, email: `${newUser}@test.com`, password: 'WorkflowPass123',
    });
    const newUserId = regBody.user.id;

    // 3. Verify user cannot login before approval
    const loginBeforeApproval = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { username: newUser, password: 'WorkflowPass123' },
    });
    expect(loginBeforeApproval.status()).toBe(401);

    // 4. Admin sees user in pending list
    const usersRes = await request.get(`${BASE_URL}/api/admin/users`, {
      headers: authHeaders(adminToken),
    });
    const users = await usersRes.json();
    const pendingUser = users.find(u => u.id === newUserId);
    expect(pendingUser).toBeTruthy();
    expect(pendingUser.approved).toBeFalsy();

    // 5. Admin approves user
    const approveRes = await request.put(`${BASE_URL}/api/admin/users/${newUserId}/approve`, {
      headers: authHeaders(adminToken),
      data: adminStepUpPayload(),
    });
    expect(approveRes.status()).toBe(200);

    // 6. User can now login
    const loginAfterApproval = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { username: newUser, password: 'WorkflowPass123' },
    });
    expect(loginAfterApproval.status()).toBe(200);
    const loginBody = await loginAfterApproval.json();
    expect(loginBody.token).toBeTruthy();

    // 7. Approved user can access their own data
    const meRes = await request.get(`${BASE_URL}/api/auth/me`, {
      headers: authHeaders(loginBody.token),
    });
    expect(meRes.status()).toBe(200);
    const me = await meRes.json();
    expect(me.username).toBe(newUser);
  });

  test('full workflow: register → admin promotes to admin → user has admin access', async ({ request }) => {
    const { token: adminToken } = await loginAPI(request);

    // Register and approve a user
    const newUser = uniqueUser('promote');
    const { body: regBody } = await registerAPI(request, {
      username: newUser, email: `${newUser}@test.com`, password: 'PromotePass123',
    });
    await approveUserAPI(request, adminToken, regBody.user.id);

    const prePromotionLogin = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { username: newUser, password: 'PromotePass123' },
    });
    const { token: prePromotionToken } = await prePromotionLogin.json();

    // Promote to admin
    const promoteRes = await request.put(`${BASE_URL}/api/admin/users/${regBody.user.id}/role`, {
      headers: authHeaders(adminToken),
      data: adminStepUpPayload({ role: 'admin' }),
    });
    expect(promoteRes.status()).toBe(200);

    const staleSessionRes = await request.get(`${BASE_URL}/api/auth/me`, {
      headers: authHeaders(prePromotionToken),
    });
    expect(staleSessionRes.status()).toBe(401);

    // Login as promoted user and verify admin access
    const loginRes = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { username: newUser, password: 'PromotePass123' },
    });
    const { token: userToken } = await loginRes.json();

    const adminUsersRes = await request.get(`${BASE_URL}/api/admin/users`, {
      headers: authHeaders(userToken),
    });
    expect(adminUsersRes.status()).toBe(200);
  });

  test('full workflow: register → approve → delete → user cannot login', async ({ request }) => {
    const { token: adminToken } = await loginAPI(request);

    // Register and approve
    const newUser = uniqueUser('delflow');
    const { body: regBody } = await registerAPI(request, {
      username: newUser, email: `${newUser}@test.com`, password: 'DeletePass123',
    });
    await approveUserAPI(request, adminToken, regBody.user.id);

    // Verify user can login
    const loginRes = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { username: newUser, password: 'DeletePass123' },
    });
    expect(loginRes.status()).toBe(200);

    // Admin deletes user
    const deleteRes = await request.delete(`${BASE_URL}/api/admin/users/${regBody.user.id}`, {
      headers: authHeaders(adminToken),
      data: adminStepUpPayload(),
    });
    expect(deleteRes.status()).toBe(200);

    // User can no longer login
    const loginAfterDelete = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { username: newUser, password: 'DeletePass123' },
    });
    expect(loginAfterDelete.status()).not.toBe(200);
  });

  // ─── Admin Panel UI Tests ─────────────────────────────────

  test('admin panel: buttons are clickable and approve works via UI', async ({ page, request }) => {
    // Register a pending user via API
    const newUser = uniqueUser('uiapprove');
    await registerAPI(request, {
      username: newUser, email: `${newUser}@test.com`, password: 'UIApprovePass123',
    });

    // Login as admin via UI
    await loginUI(page);
    await page.waitForURL(/\/(?:index\.html)?$/);

    // Navigate to admin panel
    await page.goto(`${BASE_URL}/admin.html`);

    // Wait for users to load
    await page.waitForSelector('.admin-user-row');

    // Find the pending user's approve button and click it
    const pendingSection = page.locator('#pendingList');
    const userRow = pendingSection.locator('.admin-user-row', { hasText: newUser });
    await expect(userRow).toBeVisible();
    const approveBtn = userRow.locator('button.approve');
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();

    // The admin panel opens a custom in-page modal (not a native browser dialog)
    // for the password prompt. Fill it and confirm.
    const modal = page.locator('#adminModal');
    await expect(modal).toBeVisible();
    await page.locator('#adminModalPassword').fill(ADMIN.password);
    await page.locator('#adminModalConfirm').click();
    await expect(modal).toBeHidden();

    // After approval, user should no longer be in pending section
    await expect(userRow).toBeHidden({ timeout: 5000 });

    // Verify user is now approved in the all users list
    const allUsersList = page.locator('#userList');
    const approvedRow = allUsersList.locator('.admin-user-row', { hasText: newUser });
    await expect(approvedRow).toBeVisible();
    const statusBadge = approvedRow.locator('.admin-badge.approved');
    await expect(statusBadge).toBeVisible();
  });

  test('admin panel: back to app link works', async ({ page }) => {
    await loginUI(page);
    await page.waitForURL(/\/(?:index\.html)?$/);

    await page.goto(`${BASE_URL}/admin.html`);
    await page.waitForSelector('.admin-header');

    const backLink = page.locator('.admin-back');
    await expect(backLink).toBeVisible();
    await backLink.click();
    await page.waitForURL(/\/(?:index\.html)?$/);
    expect(page.url()).not.toContain('admin.html');
  });

  test('admin panel: delete button works via UI', async ({ page, request }) => {
    // Register a user to delete
    const newUser = uniqueUser('uidelete');
    await registerAPI(request, {
      username: newUser, email: `${newUser}@test.com`, password: 'UIDeletePass123',
    });

    await loginUI(page);
    await page.waitForURL(/\/(?:index\.html)?$/);
    await page.goto(`${BASE_URL}/admin.html`);
    await page.waitForSelector('.admin-user-row');

    // Find user in the all users list (scoped to #userList to avoid pending list duplicate)
    const userRow = page.locator('#userList .admin-user-row', { hasText: newUser });
    await expect(userRow).toBeVisible();

    const deleteBtn = userRow.locator('button.danger');
    await deleteBtn.click();

    // Delete flow opens the custom #adminModal twice: first a confirmation
    // (no password field), then a password prompt. Drive both.
    const modal = page.locator('#adminModal');
    const passwordWrap = page.locator('#adminModalPasswordWrap');
    const confirmBtn = page.locator('#adminModalConfirm');

    await expect(modal).toBeVisible();
    await expect(passwordWrap).toBeHidden();
    await confirmBtn.click();

    // Second modal: password prompt
    await expect(passwordWrap).toBeVisible();
    await page.locator('#adminModalPassword').fill(ADMIN.password);
    await confirmBtn.click();
    await expect(modal).toBeHidden();

    // User row should disappear
    await expect(userRow).toBeHidden({ timeout: 5000 });
  });
});
