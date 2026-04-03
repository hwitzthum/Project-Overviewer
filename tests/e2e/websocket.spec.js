// @ts-check
const { test, expect } = require('@playwright/test');
const { BASE_URL, ADMIN, loginAPI, authHeaders, uniqueUser, registerAPI, approveUserAPI, createProjectAPI } = require('./helpers');
const WebSocket = require('ws');

/**
 * Helper: login via API and extract both token and Set-Cookie header
 * for WebSocket authentication.
 */
async function loginForWS(request, creds = ADMIN) {
  const res = await request.post(`${BASE_URL}/api/auth/login`, {
    data: { username: creds.username, password: creds.password },
  });
  const body = await res.json();
  // Extract session_token from Set-Cookie header
  const setCookies = res.headers()['set-cookie'] || '';
  const match = setCookies.match(/session_token=([^\s;]+)/);
  const cookieToken = match ? match[1] : null;
  return { token: body.token, cookieToken, user: body.user };
}

/**
 * Helper: open an authenticated WebSocket connection.
 * Returns a promise that resolves with the open WebSocket.
 */
function connectWS(cookieToken) {
  const wsUrl = BASE_URL.replace('http://', 'ws://') + '/ws';
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, {
      headers: { Cookie: `session_token=${cookieToken}` },
    });
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    // Timeout after 5s
    setTimeout(() => reject(new Error('WS connect timeout')), 5000);
  });
}

/**
 * Helper: wait for the next WebSocket message (with timeout).
 */
function waitForMessage(ws, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WS message timeout')), timeoutMs);
    ws.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });
}

/**
 * Helper: assert that NO message arrives within a window.
 */
function expectNoMessage(ws, windowMs = 1000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeAllListeners('message');
      resolve();
    }, windowMs);
    ws.once('message', (data) => {
      clearTimeout(timer);
      reject(new Error(`Unexpected message received: ${data.toString()}`));
    });
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('WebSocket — Authentication', () => {
  test('authenticated user can connect to /ws', async ({ request }) => {
    const { cookieToken } = await loginForWS(request);
    const ws = await connectWS(cookieToken);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  test('connection without cookie is rejected with 401', async () => {
    const wsUrl = BASE_URL.replace('http://', 'ws://') + '/ws';
    await expect(new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl); // no cookie
      ws.on('open', () => {
        ws.close();
        reject(new Error('Should not have connected'));
      });
      ws.on('error', () => {}); // swallow error event
      ws.on('unexpected-response', (_req, res) => {
        resolve(res.statusCode);
      });
      setTimeout(() => reject(new Error('timeout')), 5000);
    })).resolves.toBe(401);
  });

  test('connection with invalid cookie is rejected with 401', async () => {
    const wsUrl = BASE_URL.replace('http://', 'ws://') + '/ws';
    await expect(new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl, {
        headers: { Cookie: 'session_token=bogus_token_value' },
      });
      ws.on('open', () => {
        ws.close();
        reject(new Error('Should not have connected'));
      });
      ws.on('error', () => {});
      ws.on('unexpected-response', (_req, res) => {
        resolve(res.statusCode);
      });
      setTimeout(() => reject(new Error('timeout')), 5000);
    })).resolves.toBe(401);
  });

  test('connection to non-/ws path is destroyed', async ({ request }) => {
    const { cookieToken } = await loginForWS(request);
    const wsUrl = BASE_URL.replace('http://', 'ws://') + '/not-ws';
    await expect(new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl, {
        headers: { Cookie: `session_token=${cookieToken}` },
      });
      ws.on('open', () => {
        ws.close();
        reject(new Error('Should not have connected'));
      });
      ws.on('error', (err) => resolve('error'));
      ws.on('unexpected-response', (_req, res) => resolve('rejected'));
      setTimeout(() => reject(new Error('timeout')), 5000);
    })).resolves.toBeTruthy();
  });
});

test.describe('WebSocket — Real-time notifications', () => {
  let adminLogin;

  test.beforeAll(async ({ request }) => {
    adminLogin = await loginForWS(request);
  });

  test('project.created event is received on WebSocket after creating a project', async ({ request }) => {
    const ws = await connectWS(adminLogin.cookieToken);
    try {
      // Create a project — should trigger a project.created event
      const msgPromise = waitForMessage(ws);
      await createProjectAPI(request, adminLogin.token, { title: 'WS Test Project' });
      const msg = await msgPromise;

      expect(msg.event).toBe('project.created');
      expect(msg.timestamp).toBeTruthy();
    } finally {
      ws.close();
    }
  });

  test('task.created event is received after adding a task', async ({ request }) => {
    const ws = await connectWS(adminLogin.cookieToken);
    try {
      // Create a project first
      const { body: project } = await createProjectAPI(request, adminLogin.token, { title: 'WS Task Test' });

      // Now listen for task.created
      const msgPromise = waitForMessage(ws);
      await request.post(`${BASE_URL}/api/projects/${project.id}/tasks`, {
        headers: authHeaders(adminLogin.token),
        data: { title: 'WS Test Task' },
      });
      const msg = await msgPromise;

      expect(msg.event).toBe('task.created');
      expect(msg.timestamp).toBeTruthy();
    } finally {
      ws.close();
    }
  });

  test('project.updated event is received after modifying a project', async ({ request }) => {
    const ws = await connectWS(adminLogin.cookieToken);
    try {
      // Set up listener before API call to avoid missing the event
      const createPromise = waitForMessage(ws);
      const { body: project } = await createProjectAPI(request, adminLogin.token, { title: 'WS Update Test' });
      await createPromise; // drain project.created

      // Now update the project
      const msgPromise = waitForMessage(ws);
      await request.put(`${BASE_URL}/api/projects/${project.id}`, {
        headers: authHeaders(adminLogin.token),
        data: { title: 'WS Update Test Updated' },
      });
      const msg = await msgPromise;

      expect(msg.event).toBe('project.updated');
    } finally {
      ws.close();
    }
  });

  test('project.deleted event is received after deleting a project', async ({ request }) => {
    const ws = await connectWS(adminLogin.cookieToken);
    try {
      const createPromise = waitForMessage(ws);
      const { body: project } = await createProjectAPI(request, adminLogin.token, { title: 'WS Delete Test' });
      await createPromise; // drain project.created

      const msgPromise = waitForMessage(ws);
      await request.delete(`${BASE_URL}/api/projects/${project.id}`, {
        headers: authHeaders(adminLogin.token),
      });
      const msg = await msgPromise;

      expect(msg.event).toBe('project.deleted');
    } finally {
      ws.close();
    }
  });

  test('task.updated event is received after toggling a task', async ({ request }) => {
    const ws = await connectWS(adminLogin.cookieToken);
    try {
      const drainCreate = waitForMessage(ws);
      const { body: project } = await createProjectAPI(request, adminLogin.token, { title: 'WS Task Update' });
      await drainCreate; // drain project.created

      const drainTask = waitForMessage(ws);
      const taskRes = await request.post(`${BASE_URL}/api/projects/${project.id}/tasks`, {
        headers: authHeaders(adminLogin.token),
        data: { title: 'Toggle Me' },
      });
      const task = await taskRes.json();
      await drainTask; // drain task.created

      const msgPromise = waitForMessage(ws);
      await request.put(`${BASE_URL}/api/tasks/${task.id}`, {
        headers: authHeaders(adminLogin.token),
        data: { completed: true },
      });
      const msg = await msgPromise;

      expect(msg.event).toBe('task.updated');
    } finally {
      ws.close();
    }
  });

  test('task.deleted event is received after removing a task', async ({ request }) => {
    const ws = await connectWS(adminLogin.cookieToken);
    try {
      const drainCreate = waitForMessage(ws);
      const { body: project } = await createProjectAPI(request, adminLogin.token, { title: 'WS Task Delete' });
      await drainCreate; // drain project.created

      const drainTask = waitForMessage(ws);
      const taskRes = await request.post(`${BASE_URL}/api/projects/${project.id}/tasks`, {
        headers: authHeaders(adminLogin.token),
        data: { title: 'Delete Me' },
      });
      const task = await taskRes.json();
      await drainTask; // drain task.created

      const msgPromise = waitForMessage(ws);
      await request.delete(`${BASE_URL}/api/tasks/${task.id}`, {
        headers: authHeaders(adminLogin.token),
      });
      const msg = await msgPromise;

      expect(msg.event).toBe('task.deleted');
    } finally {
      ws.close();
    }
  });
});

test.describe('WebSocket — Scoped broadcasts', () => {
  test('team member receives events from teammate, non-team user does not', async ({ request }) => {
    // Setup: create two users — one will be on admin's team, one standalone
    const memberName = uniqueUser('wsmember');
    const outsiderName = uniqueUser('wsoutsider');

    // Register and approve both
    const { body: memberReg } = await registerAPI(request, {
      username: memberName, email: `${memberName}@test.com`, password: 'SecurePass12345',
    });
    const { body: outsiderReg } = await registerAPI(request, {
      username: outsiderName, email: `${outsiderName}@test.com`, password: 'SecurePass12345',
    });

    const adminLogin = await loginForWS(request);

    // Approve users
    const users = await (await request.get(`${BASE_URL}/api/admin/users`, {
      headers: authHeaders(adminLogin.token),
    })).json();
    const memberUser = users.find(u => u.username === memberName);
    const outsiderUser = users.find(u => u.username === outsiderName);
    await approveUserAPI(request, adminLogin.token, memberUser.id);
    await approveUserAPI(request, adminLogin.token, outsiderUser.id);

    // Login member and outsider
    const memberLogin = await loginForWS(request, { username: memberName, password: 'SecurePass12345' });
    const outsiderLogin = await loginForWS(request, { username: outsiderName, password: 'SecurePass12345' });

    // Create team and add member (not outsider)
    await request.post(`${BASE_URL}/api/teams`, {
      headers: authHeaders(adminLogin.token),
      data: { name: 'WS Test Team' },
    });
    const team = await (await request.get(`${BASE_URL}/api/teams/mine`, {
      headers: authHeaders(adminLogin.token),
    })).json();
    await request.post(`${BASE_URL}/api/teams/${team.id}/members`, {
      headers: authHeaders(adminLogin.token),
      data: { username: memberName },
    });

    // Connect all three to WebSocket
    // Need to reconnect admin after team creation so team membership is refreshed
    const adminWs = await connectWS(adminLogin.cookieToken);
    const memberWs = await connectWS(memberLogin.cookieToken);
    const outsiderWs = await connectWS(outsiderLogin.cookieToken);

    try {
      // Admin creates a project — member should get notification, outsider should NOT
      const memberMsgPromise = waitForMessage(memberWs, 3000);
      const outsiderNoMsg = expectNoMessage(outsiderWs, 2000);

      await createProjectAPI(request, adminLogin.token, { title: 'Team Scoped WS Test' });

      // Member receives the event
      const memberMsg = await memberMsgPromise;
      expect(memberMsg.event).toBe('project.created');

      // Outsider receives nothing
      await outsiderNoMsg;
    } finally {
      adminWs.close();
      memberWs.close();
      outsiderWs.close();

      // Cleanup: remove member from team, delete team
      await request.delete(`${BASE_URL}/api/teams/${team.id}/members/${memberUser.id}`, {
        headers: authHeaders(adminLogin.token),
      });
      await request.delete(`${BASE_URL}/api/teams/${team.id}`, {
        headers: authHeaders(adminLogin.token),
      });
    }
  });
});

test.describe('WebSocket — Connection lifecycle', () => {
  test('server responds to ping with pong', async ({ request }) => {
    const { cookieToken } = await loginForWS(request);
    const ws = await connectWS(cookieToken);
    try {
      await new Promise((resolve, reject) => {
        ws.on('pong', () => resolve(true));
        ws.ping();
        setTimeout(() => reject(new Error('pong timeout')), 3000);
      });
    } finally {
      ws.close();
    }
  });

  test('client can cleanly disconnect and reconnect', async ({ request }) => {
    const { cookieToken } = await loginForWS(request);

    // Connect
    const ws1 = await connectWS(cookieToken);
    expect(ws1.readyState).toBe(WebSocket.OPEN);

    // Disconnect
    await new Promise((resolve) => {
      ws1.on('close', resolve);
      ws1.close();
    });
    expect(ws1.readyState).toBe(WebSocket.CLOSED);

    // Reconnect with same cookie
    const ws2 = await connectWS(cookieToken);
    expect(ws2.readyState).toBe(WebSocket.OPEN);
    ws2.close();
  });

  test('multiple simultaneous connections from same user both receive events', async ({ request }) => {
    const adminLogin = await loginForWS(request);
    const ws1 = await connectWS(adminLogin.cookieToken);
    const ws2 = await connectWS(adminLogin.cookieToken);

    try {
      const msg1Promise = waitForMessage(ws1);
      const msg2Promise = waitForMessage(ws2);

      await createProjectAPI(request, adminLogin.token, { title: 'Multi-conn WS Test' });

      const [msg1, msg2] = await Promise.all([msg1Promise, msg2Promise]);
      expect(msg1.event).toBe('project.created');
      expect(msg2.event).toBe('project.created');
    } finally {
      ws1.close();
      ws2.close();
    }
  });
});
