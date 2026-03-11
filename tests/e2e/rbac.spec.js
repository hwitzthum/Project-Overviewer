const { test, expect } = require('@playwright/test');
const { BASE_URL, ADMIN, loginAPI, registerAPI, approveUserAPI, uniqueUser, authHeaders } = require('./helpers');

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
    });
    expect(res.status()).toBe(403);
  });

  test('regular user cannot change roles', async ({ request }) => {
    const { userToken, userId } = await setupUserAndAdmin(request);
    const res = await request.put(`${BASE_URL}/api/admin/users/${userId}/role`, {
      headers: authHeaders(userToken),
      data: { role: 'admin' },
    });
    expect(res.status()).toBe(403);
  });

  test('regular user cannot delete users', async ({ request }) => {
    const { userToken, userId } = await setupUserAndAdmin(request);
    const res = await request.delete(`${BASE_URL}/api/admin/users/${userId}`, {
      headers: authHeaders(userToken),
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
      data: { role: 'admin' },
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
      data: { role: 'user' },
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
      data: { role: 'superadmin' },
    });
    expect(res.status()).toBe(400);
  });
});