const { test, expect } = require("@playwright/test");
const { createClient } = require("@libsql/client");
const crypto = require("crypto");
const {
  BASE_URL,
  ADMIN,
  loginAPI,
  registerAPI,
  approveUserAPI,
  uniqueUser,
  loginUI,
  extractSessionTokenFromHeaders,
} = require("./helpers");

test.describe("Authentication", () => {
  // ─── Registration ───────────────────────────────────────────

  test("register new user successfully", async ({ request }) => {
    const user = uniqueUser();
    const { response, body } = await registerAPI(request, {
      username: user,
      email: `${user}@test.com`,
      password: "SecurePass123",
    });
    expect(response.status()).toBe(201);
    expect(body.message).toContain("pending");
    expect(body.user.username).toBe(user);
  });

  test("reject duplicate username", async ({ request }) => {
    const user = uniqueUser();
    await registerAPI(request, {
      username: user,
      email: `${user}@test.com`,
      password: "SecurePass123",
    });
    const { response } = await registerAPI(request, {
      username: user,
      email: `${user}2@test.com`,
      password: "SecurePass123",
    });
    expect(response.status()).toBe(409);
  });

  test("reject duplicate email", async ({ request }) => {
    const user1 = uniqueUser("dup1");
    const user2 = uniqueUser("dup2");
    const email = `shared_${Date.now()}@test.com`;
    await registerAPI(request, {
      username: user1,
      email,
      password: "SecurePass123",
    });
    const { response } = await registerAPI(request, {
      username: user2,
      email,
      password: "SecurePass123",
    });
    expect(response.status()).toBe(409);
  });

  test("reject short username", async ({ request }) => {
    const { response } = await registerAPI(request, {
      username: "ab",
      email: "short@test.com",
      password: "SecurePass123",
    });
    expect(response.status()).toBe(400);
  });

  test("reject short password", async ({ request }) => {
    const { response } = await registerAPI(request, {
      username: uniqueUser(),
      email: "short@test.com",
      password: "1234567", // 7 chars
    });
    expect(response.status()).toBe(400);
  });

  test("reject common password", async ({ request }) => {
    const { response, body } = await registerAPI(request, {
      username: uniqueUser(),
      email: "common@test.com",
      password: "Password1234",
    });
    expect(response.status()).toBe(400);
    expect(body.error).toContain("common");
  });

  // ─── Login ──────────────────────────────────────────────────

  test("admin can login", async ({ request }) => {
    const { token, user, response } = await loginAPI(request);
    expect(response.status()).toBe(200);
    expect(token).toBeTruthy();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(user.role).toBe("admin");
  });

  test("reject wrong password", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { username: ADMIN.username, password: "wrongpassword" },
    });
    expect(res.status()).toBe(401);
  });

  test("reject non-existent user", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { username: "nosuchuser", password: "SecurePass123" },
    });
    expect(res.status()).toBe(401);
  });

  test("unapproved user cannot login", async ({ request }) => {
    const user = uniqueUser("unapproved");
    await registerAPI(request, {
      username: user,
      email: `${user}@test.com`,
      password: "SecurePass123",
    });
    const res = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { username: user, password: "SecurePass123" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid username or password");
  });

  test("approved user can login", async ({ request }) => {
    const user = uniqueUser("approved");
    const { body: regBody } = await registerAPI(request, {
      username: user,
      email: `${user}@test.com`,
      password: "SecurePass123",
    });
    const { token: adminToken } = await loginAPI(request);
    await approveUserAPI(request, adminToken, regBody.user.id);

    const res = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { username: user, password: "SecurePass123" },
    });
    expect(res.status()).toBe(200);
    const token = extractSessionTokenFromHeaders(res.headers());
    expect(token).toBeTruthy();
  });

  test("repeated failed logins for the same account are throttled", async ({
    request,
  }) => {
    const user = uniqueUser("throttle");
    const { body: regBody } = await registerAPI(request, {
      username: user,
      email: `${user}@test.com`,
      password: "ThrottlePass123",
    });
    const { token: adminToken } = await loginAPI(request);
    await approveUserAPI(request, adminToken, regBody.user.id);

    let lastStatus = 0;
    for (let i = 0; i < 9; i += 1) {
      const res = await request.post(`${BASE_URL}/api/auth/login`, {
        data: { username: user, password: "wrong-password-value" },
      });
      lastStatus = res.status();
    }

    expect(lastStatus).toBe(429);
  });

  // ─── Session / Me ───────────────────────────────────────────

  test("GET /api/auth/me returns current user", async ({ request }) => {
    const { token } = await loginAPI(request);
    const res = await request.get(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.username).toBe(ADMIN.username);
    expect(body.role).toBe("admin");
  });

  test("session tokens are hashed at rest", async ({ request }) => {
    const { token, user } = await loginAPI(request);
    const client = createClient({
      url:
        process.env.TURSO_DATABASE_URL || "file:/tmp/project-overviewer-e2e.db",
    });
    const result = await client.execute({
      sql: "SELECT token FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
      args: [user.id],
    });
    client.close();

    expect(result.rows).toHaveLength(1);
    const storedToken = result.rows[0].token;
    expect(storedToken).not.toBe(token);
    expect(storedToken).toMatch(/^[a-f0-9]{64}$/);
  });

  test("idle sessions expire server-side", async ({ request }) => {
    const { token, user } = await loginAPI(request);
    const client = createClient({
      url:
        process.env.TURSO_DATABASE_URL || "file:/tmp/project-overviewer-e2e.db",
    });
    const tokenHash = crypto
      .createHash("sha256")
      .update(String(token))
      .digest("hex");
    const staleTimestamp = new Date(Date.now() - 31 * 60 * 1000).toISOString();

    await client.execute({
      sql: "UPDATE sessions SET last_seen_at = ? WHERE user_id = ? AND token = ?",
      args: [staleTimestamp, user.id, tokenHash],
    });

    const meRes = await request.get(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meRes.status()).toBe(401);

    const sessionCheck = await client.execute({
      sql: "SELECT id FROM sessions WHERE user_id = ? AND token = ?",
      args: [user.id, tokenHash],
    });
    client.close();

    expect(sessionCheck.rows).toHaveLength(0);
  });

  test("reject request without auth token", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/projects`);
    expect(res.status()).toBe(401);
  });

  test("reject request with invalid token", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/projects`, {
      headers: { Authorization: "Bearer fake-token-12345" },
    });
    expect(res.status()).toBe(401);
  });

  // ─── Logout ─────────────────────────────────────────────────

  test("logout invalidates session", async ({ request }) => {
    const { token } = await loginAPI(request);

    // Logout
    const logoutRes = await request.post(`${BASE_URL}/api/auth/logout`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(logoutRes.status()).toBe(200);

    // Token should no longer work
    const meRes = await request.get(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meRes.status()).toBe(401);
  });

  // ─── Password Change ───────────────────────────────────────

  test("change password", async ({ request }) => {
    const user = uniqueUser("pwdchange");
    const { body: regBody } = await registerAPI(request, {
      username: user,
      email: `${user}@test.com`,
      password: "OldPass12345",
    });
    const { token: adminToken } = await loginAPI(request);
    await approveUserAPI(request, adminToken, regBody.user.id);

    // Login as user
    const loginRes = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { username: user, password: "OldPass12345" },
    });
    const userToken = extractSessionTokenFromHeaders(loginRes.headers());

    // Change password
    const changeRes = await request.put(`${BASE_URL}/api/auth/password`, {
      headers: { Authorization: `Bearer ${userToken}` },
      data: { currentPassword: "OldPass12345", newPassword: "NewPass67890" },
    });
    expect(changeRes.status()).toBe(200);

    // Old token invalidated (sessions cleared)
    const meRes = await request.get(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(meRes.status()).toBe(401);

    // Can login with new password
    const newLoginRes = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { username: user, password: "NewPass67890" },
    });
    expect(newLoginRes.status()).toBe(200);
  });

  test("reject password change with wrong current password", async ({
    request,
  }) => {
    const { token } = await loginAPI(request);
    const res = await request.put(`${BASE_URL}/api/auth/password`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { currentPassword: "wrongpassword", newPassword: "NewPass67890" },
    });
    expect(res.status()).toBe(401);
  });

  test("reject password reuse on change", async ({ request }) => {
    const { token } = await loginAPI(request);
    const res = await request.put(`${BASE_URL}/api/auth/password`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        currentPassword: "SecureTestPass123",
        newPassword: "SecureTestPass123",
      },
    });
    expect(res.status()).toBe(400);
  });

  test("reject common password on change", async ({ request }) => {
    const { token } = await loginAPI(request);
    const res = await request.put(`${BASE_URL}/api/auth/password`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        currentPassword: "SecureTestPass123",
        newPassword: "Password123",
      },
    });
    expect(res.status()).toBe(400);
  });

  // ─── Settings UI: Change Password ──────────────────────────

  test("change password via Settings UI (self-service)", async ({
    page,
    request,
  }) => {
    const username = uniqueUser("uipwd");
    const { body: regBody } = await registerAPI(request, {
      username,
      email: `${username}@test.com`,
      password: "OriginalUiPwd99",
    });
    const { token: adminToken } = await loginAPI(request);
    await approveUserAPI(request, adminToken, regBody.user.id);

    await loginUI(page, { username, password: "OriginalUiPwd99" });
    await page.waitForURL(/\/(?:index\.html)?$/, { timeout: 5000 });
    await page.click("#openSettings");

    // The submit button must be obvious to a real user. Anything smaller than a
    // typical button (~40px tall) and a real human won't find it.
    const submit = page.locator("#changePasswordSubmit");
    await expect(submit).toBeVisible();
    const submitBox = await submit.boundingBox();
    expect(submitBox).toBeTruthy();
    expect(submitBox.height).toBeGreaterThanOrEqual(40);
    expect(submitBox.width).toBeGreaterThanOrEqual(200);
    expect(await submit.textContent()).toMatch(/save/i);

    await page.fill("#currentPassword", "OriginalUiPwd99");
    await page.fill("#newPassword", "NewUiPwd1234");
    await page.fill("#confirmPassword", "NewUiPwd1234");
    await submit.click();

    await expect(page.locator("#changePasswordMessage.success")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator("#currentPassword")).toHaveValue("");

    // PROOF of persistence: old password no longer works, new one does.
    const oldLogin = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { username, password: "OriginalUiPwd99" },
    });
    expect(oldLogin.status()).toBe(401);

    const newLogin = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { username, password: "NewUiPwd1234" },
    });
    expect(newLogin.status()).toBe(200);

    // Also confirm the round-trip works via UI re-login.
    await page.context().clearCookies();
    await loginUI(page, { username, password: "NewUiPwd1234" });
    await expect(page).toHaveURL(/\/(?:index\.html)?$/);
  });

  test("Save New Password button is visible inside the viewport at common laptop sizes", async ({
    page,
  }) => {
    const sizes = [
      { width: 1280, height: 800 },
      { width: 1366, height: 768 },
      { width: 1024, height: 768 },
      { width: 1280, height: 720 },
    ];
    for (const size of sizes) {
      await page.setViewportSize(size);
      if (page.url() === "about:blank") {
        await loginUI(page);
        await page.waitForURL(/\/(?:index\.html)?$/, { timeout: 5000 });
      } else if (!page.url().includes("3099/")) {
        await loginUI(page);
        await page.waitForURL(/\/(?:index\.html)?$/, { timeout: 5000 });
      }
      // Ensure we are on the app shell, not still inside settings from prior iteration
      await page.keyboard.press("Escape").catch(() => {});
      await page.click("#openSettings");
      await page.waitForTimeout(200);

      const btn = page.locator("#changePasswordSubmit");
      const box = await btn.boundingBox();
      expect(
        box,
        `button missing at ${size.width}x${size.height}`,
      ).toBeTruthy();
      // Bottom edge must sit inside the viewport without scrolling.
      expect(
        box.y + box.height,
        `button overflows viewport at ${size.width}x${size.height}`,
      ).toBeLessThanOrEqual(size.height);
      // Top edge must be on-screen too.
      expect(
        box.y,
        `button top off-screen at ${size.width}x${size.height}`,
      ).toBeGreaterThanOrEqual(0);

      // Close modal for next iteration
      await page.locator("#settingsModal .modal-close").first().click();
      await page.waitForTimeout(150);
    }
  });

  test("change password via Settings UI submits on Enter key", async ({
    page,
    request,
  }) => {
    const username = uniqueUser("uikbd");
    const { body: regBody } = await registerAPI(request, {
      username,
      email: `${username}@test.com`,
      password: "KeyboardOldPwd99",
    });
    const { token: adminToken } = await loginAPI(request);
    await approveUserAPI(request, adminToken, regBody.user.id);

    await loginUI(page, { username, password: "KeyboardOldPwd99" });
    await page.waitForURL(/\/(?:index\.html)?$/, { timeout: 5000 });
    await page.click("#openSettings");
    await page.fill("#currentPassword", "KeyboardOldPwd99");
    await page.fill("#newPassword", "KeyboardNewPwd99");
    await page.fill("#confirmPassword", "KeyboardNewPwd99");
    await page.locator("#confirmPassword").press("Enter");

    await expect(page.locator("#changePasswordMessage.success")).toBeVisible({
      timeout: 5000,
    });

    const newLogin = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { username, password: "KeyboardNewPwd99" },
    });
    expect(newLogin.status()).toBe(200);
  });

  test("Settings UI rejects mismatched confirmation", async ({ page }) => {
    await loginUI(page);
    await page.waitForURL(/\/(?:index\.html)?$/, { timeout: 5000 });
    await page.click("#openSettings");
    await page.fill("#currentPassword", ADMIN.password);
    await page.fill("#newPassword", "AnotherStrongPwd11");
    await page.fill("#confirmPassword", "DifferentPwd1234");
    await page.click("#changePasswordSubmit");
    await expect(page.locator("#changePasswordMessage.error")).toContainText(
      /do not match/i,
    );
  });

  test("Settings UI rejects too-short new password", async ({ page }) => {
    await loginUI(page);
    await page.waitForURL(/\/(?:index\.html)?$/, { timeout: 5000 });
    await page.click("#openSettings");
    await page.fill("#currentPassword", ADMIN.password);
    await page.fill("#newPassword", "short");
    await page.fill("#confirmPassword", "short");
    await page.click("#changePasswordSubmit");
    await expect(page.locator("#changePasswordMessage.error")).toContainText(
      /at least 12/i,
    );
  });
});
