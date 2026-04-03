// @ts-check
const { test, expect } = require('@playwright/test');
const { BASE_URL, ADMIN, loginAPI, authHeaders, uniqueUser, registerAPI, approveUserAPI } = require('./helpers');

test.describe('Webhooks API', () => {
  let adminToken;

  test.beforeAll(async ({ request }) => {
    const login = await loginAPI(request, ADMIN);
    adminToken = login.token;
  });

  test('POST /api/webhooks creates a webhook', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/webhooks`, {
      headers: authHeaders(adminToken),
      data: { url: 'https://example.com/hook', events: ['task.created'] }
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.url).toBe('https://example.com/hook');
    expect(body.secret).toBeTruthy();
    expect(body.secret.length).toBeGreaterThan(10);
    expect(body.events).toEqual(['task.created']);
    expect(body.active).toBe(true);
  });

  test('GET /api/webhooks lists webhooks with redacted secrets', async ({ request }) => {
    // Create one first
    await request.post(`${BASE_URL}/api/webhooks`, {
      headers: authHeaders(adminToken),
      data: { url: 'https://example.com/list-test', events: ['project.created'] }
    });

    const res = await request.get(`${BASE_URL}/api/webhooks`, {
      headers: authHeaders(adminToken)
    });
    expect(res.status()).toBe(200);
    const webhooks = await res.json();
    expect(webhooks.length).toBeGreaterThanOrEqual(1);
    // Secret should be redacted in list
    for (const w of webhooks) {
      expect(w.secret).toMatch(/^\*{4}.{4}$/);
    }
  });

  test('PUT /api/webhooks/:id updates a webhook', async ({ request }) => {
    const createRes = await request.post(`${BASE_URL}/api/webhooks`, {
      headers: authHeaders(adminToken),
      data: { url: 'https://example.com/update-test', events: ['project.updated'] }
    });
    const { id } = await createRes.json();

    const updateRes = await request.put(`${BASE_URL}/api/webhooks/${id}`, {
      headers: authHeaders(adminToken),
      data: { url: 'https://example.com/updated', active: false }
    });
    expect(updateRes.status()).toBe(200);
  });

  test('DELETE /api/webhooks/:id deletes a webhook', async ({ request }) => {
    const createRes = await request.post(`${BASE_URL}/api/webhooks`, {
      headers: authHeaders(adminToken),
      data: { url: 'https://example.com/delete-test', events: ['project.deleted'] }
    });
    const { id } = await createRes.json();

    const deleteRes = await request.delete(`${BASE_URL}/api/webhooks/${id}`, {
      headers: authHeaders(adminToken)
    });
    expect(deleteRes.status()).toBe(200);

    // Verify it's gone — delete again returns 404
    const deleteAgain = await request.delete(`${BASE_URL}/api/webhooks/${id}`, {
      headers: authHeaders(adminToken)
    });
    expect(deleteAgain.status()).toBe(404);
  });

  test('POST /api/webhooks rejects invalid URL', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/webhooks`, {
      headers: authHeaders(adminToken),
      data: { url: 'not-a-url' }
    });
    expect(res.status()).toBe(400);
  });

  test('Webhook isolation — user cannot see other user webhooks', async ({ request }) => {
    const user = uniqueUser('whk');
    await registerAPI(request, { username: user, email: `${user}@test.com`, password: 'SecurePass12345' });
    const users = await (await request.get(`${BASE_URL}/api/admin/users`, { headers: authHeaders(adminToken) })).json();
    const userObj = users.find(u => u.username === user);
    await approveUserAPI(request, adminToken, userObj.id);
    const login = await loginAPI(request, { username: user, password: 'SecurePass12345' });

    // Create webhook as admin
    await request.post(`${BASE_URL}/api/webhooks`, {
      headers: authHeaders(adminToken),
      data: { url: 'https://example.com/admin-only', events: ['project.created'] }
    });

    // Other user should not see it
    const res = await request.get(`${BASE_URL}/api/webhooks`, {
      headers: authHeaders(login.token)
    });
    const webhooks = await res.json();
    const adminWebhook = webhooks.find(w => w.url === 'https://example.com/admin-only');
    expect(adminWebhook).toBeUndefined();
  });
});
