const { test, expect } = require('@playwright/test');
const { BASE_URL, loginAPI, authHeaders } = require('./helpers');

test.describe('HTTP Caching', () => {
  test('frontend HTML emits versioned assets that can be cached immutably', async ({ request }) => {
    const htmlRes = await request.get(`${BASE_URL}/login.html`);
    expect(htmlRes.ok()).toBeTruthy();

    const html = await htmlRes.text();
    const scriptMatch = html.match(/src="(\/dist\/login\.bundle\.[a-f0-9]{10}\.js)"/);
    const cssMatch = html.match(/href="(\/css\/theme\.css\?v=[a-f0-9]{10})"/);

    expect(scriptMatch).toBeTruthy();
    expect(cssMatch).toBeTruthy();

    const scriptRes = await request.get(`${BASE_URL}${scriptMatch[1]}`);
    expect(scriptRes.ok()).toBeTruthy();
    expect(scriptRes.headers()['cache-control']).toBe('public, max-age=31536000, immutable');

    const cssRes = await request.get(`${BASE_URL}${cssMatch[1]}`);
    expect(cssRes.ok()).toBeTruthy();
    // CSS gets immutable caching in production; revalidation otherwise (test/dev)
    const cssCacheControl = cssRes.headers()['cache-control'];
    if (process.env.NODE_ENV === 'production') {
      expect(cssCacheControl).toBe('public, max-age=31536000, immutable');
    } else {
      expect(cssCacheControl).toBe('no-cache, max-age=0, must-revalidate');
    }
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
