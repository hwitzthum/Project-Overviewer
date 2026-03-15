const { test, expect } = require('@playwright/test');
const { BASE_URL, authHeaders } = require('./helpers');

test.describe('API Versioning', () => {
  test('v1 auth and project routes work', async ({ request }) => {
    const loginRes = await request.post(`${BASE_URL}/api/v1/auth/login`, {
      data: { username: 'testadmin', password: 'SecureTestPass123' },
    });

    expect(loginRes.ok()).toBeTruthy();
    const loginBody = await loginRes.json();
    expect(loginBody.token).toBeTruthy();

    const createRes = await request.post(`${BASE_URL}/api/v1/projects`, {
      headers: authHeaders(loginBody.token),
      data: { title: 'Versioned API Project', status: 'not-started', priority: 'medium' },
    });
    expect(createRes.ok()).toBeTruthy();
    const project = await createRes.json();

    const listRes = await request.get(`${BASE_URL}/api/v1/projects`, {
      headers: authHeaders(loginBody.token),
    });

    expect(listRes.ok()).toBeTruthy();
    const listBody = await listRes.json();
    expect(Array.isArray(listBody)).toBeTruthy();
    expect(listBody.some(entry => entry.id === project.id)).toBeTruthy();
  });

  test('v1 health endpoint works without auth', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/v1/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBeTruthy();
  });
});
