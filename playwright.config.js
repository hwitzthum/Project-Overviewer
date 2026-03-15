const { defineConfig } = require('@playwright/test');

// Playwright sets FORCE_COLOR in some environments. If NO_COLOR is also
// present, Node warns that one overrides the other, so drop the conflicting
// variable before spawning the web server and worker processes.
if (process.env.FORCE_COLOR && process.env.NO_COLOR) {
  delete process.env.NO_COLOR;
}

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // Sequential — tests share server state
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '/tmp/project-overviewer-playwright-report' }]],
  outputDir: '/tmp/project-overviewer-test-results',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3099',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'env -u NO_COLOR NODE_ENV=test ADMIN_USER=testadmin ADMIN_PASS=SecureTestPass123 PORT=3099 TURSO_DATABASE_URL=file:/tmp/project-overviewer-e2e.db SECURITY_LOG_PATH=/tmp/project-overviewer-security.log node server.js',
    port: 3099,
    timeout: 15000,
    reuseExistingServer: false,
    env: {
      NODE_ENV: 'test',
      ADMIN_USER: 'testadmin',
      ADMIN_PASS: 'SecureTestPass123',
      PORT: '3099',
      TURSO_DATABASE_URL: 'file:/tmp/project-overviewer-e2e.db',
      SECURITY_LOG_PATH: '/tmp/project-overviewer-security.log',
    },
  },
});
