// @ts-check
const { test, expect } = require('@playwright/test');
const {
  BASE_URL, ADMIN, loginAPI, authHeaders, uniqueUser,
  registerAPI, approveUserAPI, createProjectAPI, createTaskAPI, createDocumentAPI
} = require('./helpers');

/**
 * Security hardening tests — covers IDOR, SSRF edge cases, webhook limits,
 * and event schema validation found in the OWASP Top 10 review.
 */

// Helper: create a second approved user and return their token
async function createSecondUser(request, adminToken) {
  const username = uniqueUser('secuser');
  const password = 'SecureHarden12345';
  await registerAPI(request, { username, email: `${username}@test.com`, password });
  const users = await (await request.get(`${BASE_URL}/api/admin/users`, {
    headers: authHeaders(adminToken)
  })).json();
  const userObj = users.find(u => u.username === username);
  await approveUserAPI(request, adminToken, userObj.id);
  const login = await loginAPI(request, { username, password });
  return { token: login.token, userId: userObj.id, username };
}

test.describe('IDOR — Task access control', () => {
  let adminToken;
  let userB;
  let adminProjectId;
  let adminTaskId;

  test.beforeAll(async ({ request }) => {
    const login = await loginAPI(request, ADMIN);
    adminToken = login.token;
    userB = await createSecondUser(request, adminToken);

    // Create a project and task owned by admin
    const project = await createProjectAPI(request, adminToken, { title: 'Admin IDOR Project' });
    adminProjectId = project.body.id;
    const task = await createTaskAPI(request, adminToken, adminProjectId, { title: 'Admin Task' });
    adminTaskId = task.body.id;
  });

  test('User B cannot update admin task via PUT /api/tasks/:id', async ({ request }) => {
    const res = await request.put(`${BASE_URL}/api/tasks/${adminTaskId}`, {
      headers: authHeaders(userB.token),
      data: { title: 'Hijacked Task' }
    });
    expect(res.status()).toBe(404);
  });

  test('User B cannot delete admin task via DELETE /api/tasks/:id', async ({ request }) => {
    const res = await request.delete(`${BASE_URL}/api/tasks/${adminTaskId}`, {
      headers: authHeaders(userB.token)
    });
    expect(res.status()).toBe(404);
  });
});

test.describe('IDOR — Document access control', () => {
  let adminToken;
  let userB;
  let adminDocId;

  test.beforeAll(async ({ request }) => {
    const login = await loginAPI(request, ADMIN);
    adminToken = login.token;
    userB = await createSecondUser(request, adminToken);

    // Create a project with a document owned by admin
    const project = await createProjectAPI(request, adminToken, { title: 'Admin Doc Project' });
    const doc = await createDocumentAPI(request, adminToken, project.body.id, {
      type: 'email',
      title: 'Confidential Email',
      payload: { from: 'admin@test.com', to: 'ceo@test.com', subject: 'Secret', body: 'Classified info' }
    });
    adminDocId = doc.body.id;
  });

  test('User B cannot download admin document', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/documents/${adminDocId}/download`, {
      headers: authHeaders(userB.token)
    });
    // Should be 404 or 403, not 200
    expect([403, 404]).toContain(res.status());
  });

  test('User B cannot delete admin document', async ({ request }) => {
    const res = await request.delete(`${BASE_URL}/api/documents/${adminDocId}`, {
      headers: authHeaders(userB.token)
    });
    expect([403, 404]).toContain(res.status());
  });
});

test.describe('IDOR — Webhook access control', () => {
  let adminToken;
  let userB;
  let adminWebhookId;

  test.beforeAll(async ({ request }) => {
    const login = await loginAPI(request, ADMIN);
    adminToken = login.token;
    userB = await createSecondUser(request, adminToken);

    const res = await request.post(`${BASE_URL}/api/webhooks`, {
      headers: authHeaders(adminToken),
      data: { url: 'https://example.com/idor-test', events: ['task.created'] }
    });
    const body = await res.json();
    adminWebhookId = body.id;
  });

  test('User B cannot update admin webhook', async ({ request }) => {
    const res = await request.put(`${BASE_URL}/api/webhooks/${adminWebhookId}`, {
      headers: authHeaders(userB.token),
      data: { url: 'https://evil.com/hijacked' }
    });
    expect(res.status()).toBe(404);
  });

  test('User B cannot delete admin webhook', async ({ request }) => {
    const res = await request.delete(`${BASE_URL}/api/webhooks/${adminWebhookId}`, {
      headers: authHeaders(userB.token)
    });
    expect(res.status()).toBe(404);
  });
});

test.describe('Webhook — Per-user limit', () => {
  let userToken;
  let adminToken;

  test.beforeAll(async ({ request }) => {
    const login = await loginAPI(request, ADMIN);
    adminToken = login.token;
    const user = await createSecondUser(request, adminToken);
    userToken = user.token;
  });

  test('Creating more than MAX_WEBHOOKS_PER_USER returns 400', async ({ request }) => {
    // Create webhooks up to the limit (20)
    const MAX = 20;
    for (let i = 0; i < MAX; i++) {
      const res = await request.post(`${BASE_URL}/api/webhooks`, {
        headers: authHeaders(userToken),
        data: { url: `https://example.com/limit-test-${i}`, events: ['task.created'] }
      });
      expect(res.status()).toBe(201);
    }

    // The next one should be rejected
    const res = await request.post(`${BASE_URL}/api/webhooks`, {
      headers: authHeaders(userToken),
      data: { url: 'https://example.com/over-limit', events: ['task.created'] }
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('limit');
  });
});

test.describe('Webhook — SSRF edge cases', () => {
  let adminToken;

  test.beforeAll(async ({ request }) => {
    const login = await loginAPI(request, ADMIN);
    adminToken = login.token;
  });

  test('file:// scheme is rejected', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/webhooks`, {
      headers: authHeaders(adminToken),
      data: { url: 'file:///etc/passwd', events: ['task.created'] }
    });
    expect(res.status()).toBe(400);
  });

  test('ftp:// scheme is rejected', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/webhooks`, {
      headers: authHeaders(adminToken),
      data: { url: 'ftp://evil.com/exploit', events: ['task.created'] }
    });
    expect(res.status()).toBe(400);
  });

  test('169.254.169.254 (cloud metadata) is rejected', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/webhooks`, {
      headers: authHeaders(adminToken),
      data: { url: 'http://169.254.169.254/latest/meta-data/', events: ['task.created'] }
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Private');
  });

  test('127.0.0.1 (loopback) is rejected', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/webhooks`, {
      headers: authHeaders(adminToken),
      data: { url: 'http://127.0.0.1:8080/hook', events: ['task.created'] }
    });
    expect(res.status()).toBe(400);
  });

  test('10.0.0.1 (private RFC1918) is rejected', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/webhooks`, {
      headers: authHeaders(adminToken),
      data: { url: 'http://10.0.0.1/hook', events: ['task.created'] }
    });
    expect(res.status()).toBe(400);
  });

  test('::1 (IPv6 loopback) is rejected', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/webhooks`, {
      headers: authHeaders(adminToken),
      data: { url: 'http://[::1]/hook', events: ['task.created'] }
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('Webhook — Event validation', () => {
  let adminToken;

  test.beforeAll(async ({ request }) => {
    const login = await loginAPI(request, ADMIN);
    adminToken = login.token;
  });

  test('Arbitrary event string is rejected', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/webhooks`, {
      headers: authHeaders(adminToken),
      data: { url: 'https://example.com/event-test', events: ['not.a.real.event'] }
    });
    expect(res.status()).toBe(400);
  });

  test('Valid event types are accepted', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/webhooks`, {
      headers: authHeaders(adminToken),
      data: { url: 'https://example.com/valid-events', events: ['task.created', 'project.*'] }
    });
    expect(res.status()).toBe(201);
  });
});
