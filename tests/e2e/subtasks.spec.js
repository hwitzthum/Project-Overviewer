// @ts-check
const { test, expect } = require('@playwright/test');
const { BASE_URL, ADMIN, loginAPI, authHeaders, createProjectAPI, createTaskAPI } = require('./helpers');

test.describe('Subtasks API', () => {
  let adminToken;
  let projectId;

  test.beforeAll(async ({ request }) => {
    const login = await loginAPI(request, ADMIN);
    adminToken = login.token;

    const proj = await createProjectAPI(request, adminToken, { title: 'Subtask Test Project' });
    projectId = proj.body.id;
  });

  test('create a subtask under a parent task', async ({ request }) => {
    // Create parent task
    const parent = await createTaskAPI(request, adminToken, projectId, { title: 'Parent Task' });
    expect(parent.response.status()).toBe(201);
    const parentId = parent.body.id;

    // Create subtask
    const sub = await request.post(`${BASE_URL}/api/projects/${projectId}/tasks`, {
      headers: authHeaders(adminToken),
      data: { title: 'Child Task', parentTaskId: parentId }
    });
    expect(sub.status()).toBe(201);
    const subBody = await sub.json();
    expect(subBody.id).toBeTruthy();

    // Verify nesting in GET response
    const projRes = await request.get(`${BASE_URL}/api/projects/${projectId}`, {
      headers: authHeaders(adminToken)
    });
    const project = await projRes.json();
    const parentTask = project.tasks.find(t => t.id === parentId);
    expect(parentTask).toBeTruthy();
    expect(parentTask.subtasks).toBeTruthy();
    expect(parentTask.subtasks.length).toBe(1);
    expect(parentTask.subtasks[0].title).toBe('Child Task');
    expect(parentTask.subtasks[0].parentTaskId).toBe(parentId);
  });

  test('enforce 1-level nesting — reject grandchild', async ({ request }) => {
    const parent = await createTaskAPI(request, adminToken, projectId, { title: 'Level 0' });
    const parentId = parent.body.id;

    const child = await request.post(`${BASE_URL}/api/projects/${projectId}/tasks`, {
      headers: authHeaders(adminToken),
      data: { title: 'Level 1', parentTaskId: parentId }
    });
    expect(child.status()).toBe(201);
    const childId = (await child.json()).id;

    // Try to create grandchild — should fail
    const grandchild = await request.post(`${BASE_URL}/api/projects/${projectId}/tasks`, {
      headers: authHeaders(adminToken),
      data: { title: 'Level 2', parentTaskId: childId }
    });
    expect(grandchild.status()).toBe(400);
    const body = await grandchild.json();
    expect(body.error).toContain('Cannot nest subtasks');
  });

  test('bulk create rejects grandchild hierarchies atomically', async ({ request }) => {
    const proj = await createProjectAPI(request, adminToken, { title: 'Bulk Grandchild Rejection' });
    const pid = proj.body.id;

    const bulk = await request.post(`${BASE_URL}/api/projects/${pid}/tasks/bulk`, {
      headers: authHeaders(adminToken),
      data: [
        { tempId: 'root', title: 'Level 0' },
        { tempId: 'child', title: 'Level 1', parentTempId: 'root' },
        { title: 'Level 2', parentTempId: 'child' }
      ]
    });

    expect(bulk.status()).toBe(400);
    const body = await bulk.json();
    expect(body.error).toContain('Cannot nest subtasks');

    const projectRes = await request.get(`${BASE_URL}/api/projects/${pid}`, {
      headers: authHeaders(adminToken)
    });
    expect(projectRes.status()).toBe(200);
    const project = await projectRes.json();
    expect(project.tasks).toEqual([]);
  });

  test('subtasks appear in project task list via GET /api/projects', async ({ request }) => {
    const proj = await createProjectAPI(request, adminToken, { title: 'List Subtask Project' });
    const pid = proj.body.id;

    const parent = await createTaskAPI(request, adminToken, pid, { title: 'Main Task' });
    const parentId = parent.body.id;

    await request.post(`${BASE_URL}/api/projects/${pid}/tasks`, {
      headers: authHeaders(adminToken),
      data: { title: 'Sub A', parentTaskId: parentId }
    });
    await request.post(`${BASE_URL}/api/projects/${pid}/tasks`, {
      headers: authHeaders(adminToken),
      data: { title: 'Sub B', parentTaskId: parentId }
    });

    const res = await request.get(`${BASE_URL}/api/projects`, {
      headers: authHeaders(adminToken)
    });
    const projects = await res.json();
    const p = projects.find(proj => proj.id === pid);
    expect(p).toBeTruthy();

    const mainTask = p.tasks.find(t => t.id === parentId);
    expect(mainTask.subtasks.length).toBe(2);
    expect(mainTask.subtasks.map(s => s.title).sort()).toEqual(['Sub A', 'Sub B']);
  });

  test('delete parent cascades to subtasks', async ({ request }) => {
    const proj = await createProjectAPI(request, adminToken, { title: 'Cascade Test' });
    const pid = proj.body.id;

    const parent = await createTaskAPI(request, adminToken, pid, { title: 'Will Be Deleted' });
    const parentId = parent.body.id;

    const subRes = await request.post(`${BASE_URL}/api/projects/${pid}/tasks`, {
      headers: authHeaders(adminToken),
      data: { title: 'Orphan Candidate', parentTaskId: parentId }
    });
    const subId = (await subRes.json()).id;

    // Delete parent
    const del = await request.delete(`${BASE_URL}/api/tasks/${parentId}`, {
      headers: authHeaders(adminToken)
    });
    expect(del.status()).toBe(200);

    // Subtask should also be gone (or at least not in project)
    const projRes = await request.get(`${BASE_URL}/api/projects/${pid}`, {
      headers: authHeaders(adminToken)
    });
    const project = await projRes.json();
    // No tasks should reference the deleted parent
    const allTasks = project.tasks.flatMap(t => [t, ...(t.subtasks || [])]);
    expect(allTasks.find(t => t.id === subId)).toBeUndefined();
  });

  test('subtask completion is independent from parent', async ({ request }) => {
    const proj = await createProjectAPI(request, adminToken, { title: 'Completion Test' });
    const pid = proj.body.id;

    const parent = await createTaskAPI(request, adminToken, pid, { title: 'Parent' });
    const parentId = parent.body.id;

    const sub = await request.post(`${BASE_URL}/api/projects/${pid}/tasks`, {
      headers: authHeaders(adminToken),
      data: { title: 'Sub', parentTaskId: parentId }
    });
    const subId = (await sub.json()).id;

    // Complete subtask
    await request.put(`${BASE_URL}/api/tasks/${subId}`, {
      headers: authHeaders(adminToken),
      data: { completed: true }
    });

    // Verify parent is still not completed
    const projRes = await request.get(`${BASE_URL}/api/projects/${pid}`, {
      headers: authHeaders(adminToken)
    });
    const project = await projRes.json();
    const parentTask = project.tasks.find(t => t.id === parentId);
    expect(parentTask.completed).toBe(false);
    expect(parentTask.subtasks[0].completed).toBe(true);
  });

  test('tasks without parentTaskId return subtasks as empty array', async ({ request }) => {
    const proj = await createProjectAPI(request, adminToken, { title: 'No Subtasks Project' });
    const pid = proj.body.id;
    await createTaskAPI(request, adminToken, pid, { title: 'Plain Task' });

    const res = await request.get(`${BASE_URL}/api/projects/${pid}`, {
      headers: authHeaders(adminToken)
    });
    const project = await res.json();
    expect(project.tasks[0].subtasks).toEqual([]);
    expect(project.tasks[0].parentTaskId).toBeNull();
  });
});
