# Code Review Consolidation & Implementation Plan

## Summary of Findings

Three parallel review agents analyzed the full codebase. After deduplication, **27 unique issues** remain across security, correctness, and performance. Here's the consolidated, prioritized plan structured for parallel implementation.

---

## Phase 1 — Critical Security & Bugs (Must Fix)

### Batch 1A — Independent fixes (can run in parallel)

- [ ] **S1: Remove localStorage token storage** (api-client.js)
  - Security: HIGH — XSS can exfiltrate token from localStorage
  - Fix: Remove localStorage read/write, keep in-memory only. On page load, rely on HttpOnly cookie + `GET /api/auth/me` to validate session
  - Files: `public/js/api-client.js`, `public/index.html`, `public/login.html`
  - Agents: Security #1, Devil's Advocate #1

- [ ] **S2: Import endpoint bypasses settings key allowlist** (database.js)
  - Security: HIGH — arbitrary keys written to user_settings
  - Fix: Add VALID_SETTINGS_KEYS check in importData(). Extract allowlist to shared constant
  - Files: `database.js`, `server.js` (extract constant)
  - Agents: Security #2, Devil's Advocate #26

- [ ] **S3: Content-Disposition filename injection** (server.js)
  - Security: HIGH — header constructed via template string
  - Fix: Use RFC 5987 encoding with `filename*=UTF-8''...`
  - Files: `server.js`
  - Agent: Security #3

- [ ] **S4: Zod fallback silently disables all validation** (server.js)
  - Security: MEDIUM — server runs with zero validation if Zod missing
  - Fix: Hard fail with `process.exit(1)` if Zod or Helmet can't load
  - Files: `server.js`
  - Agents: Security #6, Devil's Advocate #3

- [ ] **S5: Password change missing max length** (server.js)
  - Security: LOW — bcrypt truncates at 72 bytes
  - Fix: Add `newPassword.length > 128` check
  - Files: `server.js`
  - Agents: Security #9, Devil's Advocate #4

- [ ] **S6: Health check leaks error messages** (database.js)
  - Security: LOW — internal paths exposed to unauthenticated callers
  - Fix: Return generic "Database unavailable", log details internally
  - Files: `database.js`
  - Agent: Security #8

### Batch 1B — Independent fixes (can run in parallel)

- [ ] **B1: createRecurringTask appends stub `{id}` to state** (tasks.js)
  - Bug: HIGH — recurring task renders as broken empty entry
  - Fix: Construct full task object client-side before appending to state
  - Files: `public/js/tasks.js`
  - Agent: Devil's Advocate #9

- [ ] **B2: Timezone date parsing bug** (utils.js)
  - Bug: MEDIUM — tasks show "overdue" before actual due date for UTC-west users
  - Fix: Change `new Date(dateStr)` to `new Date(dateStr + 'T00:00:00')` for date-only strings in all 5 date functions
  - Files: `public/js/utils.js`
  - Agent: Devil's Advocate #12

- [ ] **B3: Statistics include archived project tasks** (render.js)
  - Bug: MEDIUM — archived tasks inflate completion stats
  - Fix: Filter `state.projects.filter(p => !p.archived)` before building task list in renderStatistics()
  - Files: `public/js/render.js`
  - Agent: Devil's Advocate #11

- [ ] **B4: "Convert to Task" targets wrong project in team mode** (app.js)
  - Bug: MEDIUM — task silently fails if first project is teammate's
  - Fix: Filter to user-owned projects only, or show project picker
  - Files: `public/js/app.js`
  - Agent: Devil's Advocate #16

- [ ] **B5: Escape closes all modals instead of topmost** (keyboard.js)
  - UX Bug: MEDIUM — user loses editing context
  - Fix: Implement modal stack, Escape closes only topmost
  - Files: `public/js/keyboard.js`, `public/js/modals.js`
  - Agent: Devil's Advocate #14

- [ ] **B6: saveProjectEdits fires on every blur/change with no debounce** (modals.js)
  - Bug: MEDIUM — parallel PUT requests can arrive out of order
  - Fix: Add 300ms debounce to saveProjectEdits
  - Files: `public/js/modals.js`
  - Agent: Devil's Advocate #8

---

## Phase 2 — Performance (High & Medium Impact)

### Batch 2A — Database performance (can run in parallel)

- [ ] **P1: getTeamUserIds runs 2 sequential queries** (database.js)
  - Perf: HIGH — 2 extra round-trips on every authenticated team request
  - Fix: Single self-join query
  - Files: `database.js`
  - Agent: Performance #1

- [ ] **P2: Add composite index on user_settings(user_id, key)** (database.js)
  - Perf: MEDIUM — covering index for getUserSetting
  - Files: `database.js`
  - Agent: Performance #6

- [ ] **P3: reorderProjects/reorderTasks run N individual UPDATEs** (database.js)
  - Perf: MEDIUM — N round-trips instead of 1
  - Fix: Single CASE WHEN statement
  - Files: `database.js`
  - Agent: Performance #3

- [ ] **P4: updateProject re-fetches full project after write** (database.js)
  - Perf: MEDIUM — 3 unnecessary queries after every update
  - Fix: Return updated fields directly
  - Files: `database.js`
  - Agent: Performance #2

- [ ] **P5: saveQuickNotes runs SELECT before UPDATE** (database.js)
  - Perf: LOW — use INSERT ... ON CONFLICT DO UPDATE
  - Files: `database.js`
  - Agent: Performance #4

### Batch 2B — Frontend performance (can run in parallel)

- [ ] **P6: updateCounts iterates projects 18+ times** (filters.js)
  - Perf: HIGH — runs on every render
  - Fix: Single-pass accumulation loop
  - Files: `public/js/filters.js`
  - Agent: Performance #7

- [ ] **P7: Two click listeners on #content** (events.js)
  - Perf: MEDIUM — every click traverses 2 handlers
  - Fix: Merge into single handler
  - Files: `public/js/events.js`
  - Agent: Performance #5

- [ ] **P8: escapeHtml allocates object on every char match** (utils.js)
  - Perf: LOW-MEDIUM — runs thousands of times per render
  - Fix: Hoist map outside function
  - Files: `public/js/utils.js`
  - Agent: Performance #8

- [ ] **P9: deleteProject prefetches full project before every delete** (projects.js)
  - Perf: MEDIUM — unnecessary network round-trip
  - Fix: Use in-memory snapshot
  - Files: `public/js/projects.js`
  - Agent: Performance #9

---

## Phase 3 — Robustness & Edge Cases

### Batch 3A (can run in parallel)

- [ ] **R1: Workspace mode toggle race condition** (state.js)
  - Fix: Add AbortController to loadFromStorage, cancel previous in-flight load
  - Files: `public/js/state.js`
  - Agent: Devil's Advocate #7

- [ ] **R2: restoreDeletedProject loses document content & task dependencies** (state.js)
  - Fix: Use in-memory snapshot (already has tasks), note document content limitation
  - Files: `public/js/state.js`
  - Agent: Devil's Advocate #6

- [ ] **R3: uuid() uses Math.random()** (utils.js)
  - Fix: Replace with crypto.randomUUID()
  - Files: `public/js/utils.js`
  - Agent: Security #5

- [ ] **R4: Document upload — no MIME allowlist on write, no per-user storage limit** (database.js, server.js)
  - Fix: Allowlist mimeType in createDocument, add per-user document count check
  - Files: `database.js`, `server.js`
  - Agent: Security #7

- [ ] **R5: User menu click listener never removed** (team.js)
  - Fix: Use `{ once: true }` pattern
  - Files: `public/js/team.js`
  - Agent: Performance #10

---

## Implementation Strategy

**Total: 27 fixes across 14 files**

The batches within each phase are independent and can be implemented by parallel agents:

| Phase | Batches | Parallelism | Est. Files |
|-------|---------|-------------|------------|
| 1 | 1A (6 items) + 1B (6 items) | 12 parallel fixes across ~10 files | server.js, database.js, api-client.js, tasks.js, utils.js, render.js, app.js, keyboard.js, modals.js, index.html, login.html |
| 2 | 2A (5 items) + 2B (4 items) | 9 parallel fixes across ~5 files | database.js, filters.js, events.js, utils.js, projects.js |
| 3 | 3A (5 items) | 5 parallel fixes across ~4 files | state.js, utils.js, database.js, server.js, team.js |

**Optimal agent grouping** (by file to avoid conflicts):
- Agent A: `server.js` fixes → S3, S4, S5, R4 (server part)
- Agent B: `database.js` fixes → S2, S6, P1, P2, P3, P4, P5, R4 (db part)
- Agent C: `public/js/` frontend batch 1 → S1, B1, B2, B3, B4, B6, R3
- Agent D: `public/js/` frontend batch 2 → P6, P7, P8, P9, B5, R1, R2, R5

After all fixes: run `npm test` to verify 93 tests still pass.