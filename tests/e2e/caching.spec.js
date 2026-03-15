const { test, expect } = require('@playwright/test');
const { BASE_URL, loginAPI, authHeaders } = require('./helpers');

test.describe('HTTP Caching', () => {
  test('bundled frontend assets send cache headers', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/dist/app.bundle.js`);
    expect(res.ok()).toBeTruthy();
    expect(res.headers()['cache-control']).toBe('public, max-age=3600, stale-while-revalidate=86400');
  });

  test('versioned API reads send revalidation headers', async ({ request }) => {
    const { token } = await loginAPI(request);
    const res = await request.get(`${BASE_URL}/api/v1/projects`, {
      headers: authHeaders(token),
    });

    expect(res.ok()).toBeTruthy();
    expect(res.headers()['cache-control']).toBe('private, no-cache, must-revalidate');
    expect(res.headers()['vary']).toContain('Authorization');
  });

  test('document downloads remain no-store', async ({ request }) => {
    const { token } = await loginAPI(request);
    const createProjectRes = await request.post(`${BASE_URL}/api/v1/projects`, {
      headers: authHeaders(token),
      data: { title: 'Caching Download Project', status: 'not-started', priority: 'medium' },
    });
    const project = await createProjectRes.json();

    const documentRes = await request.post(`${BASE_URL}/api/v1/projects/${project.id}/documents`, {
      headers: authHeaders(token),
      data: {
        type: 'docx',
        title: 'Caching Spec Document',
        contentBase64: Buffer.from('hello').toString('base64'),
        mimeType: 'text/plain',
        fileName: 'caching.txt',
      },
    });
    const document = await documentRes.json();

    const downloadRes = await request.get(`${BASE_URL}/api/v1/documents/${document.id}/download`, {
      headers: authHeaders(token),
    });

    expect(downloadRes.ok()).toBeTruthy();
    expect(downloadRes.headers()['cache-control']).toBe('no-store, max-age=0');
  });
});
