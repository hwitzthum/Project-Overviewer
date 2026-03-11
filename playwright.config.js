const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // Sequential — tests share server state
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3099',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'NODE_ENV=test ADMIN_USER=testadmin ADMIN_PASS=SecureTestPass123 PORT=3099 node server.js',
    port: 3099,
    timeout: 15000,
    reuseExistingServer: false,
    env: {
      NODE_ENV: 'test',
      ADMIN_USER: 'testadmin',
      ADMIN_PASS: 'SecureTestPass123',
      PORT: '3099',
    },
  },
});