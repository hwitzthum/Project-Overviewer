const { test, expect } = require('@playwright/test');
const { ADMIN, loginUI, uniqueUser } = require('./helpers');

test.describe('UI: Login Page', () => {

  test('root redirects unauthenticated users to login before app shell renders', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL('**/login.html', { timeout: 5000 });
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#app')).toHaveCount(0);
  });

  test('login page loads correctly', async ({ page }) => {
    await page.goto('/login.html');
    await expect(page.locator('h1')).toContainText('Project Overviewer');
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#submitBtn')).toBeVisible();
  });

  test('login with valid admin credentials redirects to app', async ({ page }) => {
    await loginUI(page);
    // Should redirect to / (main app)
    await page.waitForURL('/', { timeout: 5000 });
    expect(page.url()).not.toContain('login');
  });

  test('login with wrong password shows error', async ({ page }) => {
    await page.goto('/login.html');
    await page.fill('#username', ADMIN.username);
    await page.fill('#password', 'wrongpassword');
    await page.click('#submitBtn');
    // Error message should appear
    await expect(page.locator('#message')).toHaveClass(/visible/, { timeout: 3000 });
    await expect(page.locator('#msg-text')).toContainText(/invalid|incorrect/i);
  });

  test('password toggle button works', async ({ page }) => {
    await page.goto('/login.html');
    const pwdInput = page.locator('#password');
    await expect(pwdInput).toHaveAttribute('type', 'password');

    await page.click('#togglePwd');
    await expect(pwdInput).toHaveAttribute('type', 'text');

    await page.click('#togglePwd');
    await expect(pwdInput).toHaveAttribute('type', 'password');
  });

  test('link to register page exists', async ({ page }) => {
    await page.goto('/login.html');
    const registerLink = page.locator('a[href="/register.html"]');
    await expect(registerLink).toBeVisible();
  });
});

test.describe('UI: Register Page', () => {

  test('register page loads correctly', async ({ page }) => {
    await page.goto('/register.html');
    await expect(page.locator('h1')).toContainText('Project Overviewer');
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#confirmPassword')).toBeVisible();
  });

  test('register shows pending state on success', async ({ page }) => {
    const user = uniqueUser('uitest');
    await page.goto('/register.html');
    await page.fill('#username', user);
    await page.fill('#email', `${user}@test.com`);
    await page.fill('#password', 'SecurePass123');
    await page.fill('#confirmPassword', 'SecurePass123');
    await page.click('#submitBtn');

    // Pending state should appear
    await expect(page.locator('#pendingState')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#pendingState')).toContainText(/pending|approval/i);
  });

  test('register shows error for mismatched passwords', async ({ page }) => {
    await page.goto('/register.html');
    await page.fill('#username', uniqueUser());
    await page.fill('#email', 'test@test.com');
    await page.fill('#password', 'SecurePass123');
    await page.fill('#confirmPassword', 'DifferentPass456');
    await page.click('#submitBtn');

    await expect(page.locator('#message')).toHaveClass(/visible/, { timeout: 3000 });
    await expect(page.locator('#msg-text')).toContainText(/match/i);
  });

  test('password strength meter updates', async ({ page }) => {
    await page.goto('/register.html');
    const strengthEl = page.locator('#pwdStrength');

    // Empty
    await expect(strengthEl).toHaveAttribute('data-strength', '0');

    // Type a weak password
    await page.fill('#password', '12345678');
    await expect(strengthEl).not.toHaveAttribute('data-strength', '0');
  });

  test('link to login page exists', async ({ page }) => {
    await page.goto('/register.html');
    const loginLink = page.locator('a[href="/login.html"]');
    await expect(loginLink).toBeVisible();
  });
});

test.describe('UI: Admin Page', () => {

  test('admin page loads for admin user', async ({ page }) => {
    // Login first
    await loginUI(page);
    await page.waitForURL('/', { timeout: 5000 });

    // Navigate to admin
    await page.goto('/admin.html');
    await expect(page.locator('h1')).toContainText('Admin');
    // Should see stats
    await expect(page.locator('#statTotal')).not.toHaveText('-', { timeout: 5000 });
  });
});

test.describe('UI: Theme Switcher', () => {

  test('theme picker changes theme on login page', async ({ page }) => {
    await page.goto('/login.html');

    // Click dark theme
    await page.click('.theme-dot[data-theme="dark"]');
    const theme = await page.getAttribute('html', 'data-theme');
    expect(theme).toBe('dark');

    // Click ocean theme
    await page.click('.theme-dot[data-theme="ocean"]');
    const theme2 = await page.getAttribute('html', 'data-theme');
    expect(theme2).toBe('ocean');
  });

  test('selected app theme carries into the admin page', async ({ page }) => {
    await loginUI(page);
    await page.waitForURL('/', { timeout: 5000 });

    await page.click('#openSettings');
    await page.click('#settingsModal .settings-option[data-theme="forest"]');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'forest');

    await page.goto('/admin.html');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'forest');
    await expect(page.locator('h1')).toContainText('Admin');
  });
});
