# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Project Overviewer is a multi-user project and task management application with session-based authentication, role-based access control (RBAC), and team collaboration. It uses a client-server architecture with Express.js serving a modular single-page application (SPA) built with vanilla JavaScript.

**Technology Stack:**
- **Backend**: Node.js with Express.js
- **Database**: LibSQL (`@libsql/client`) — SQLite-compatible; connects to local file or remote Turso cloud DB
- **Frontend**: Modular vanilla JavaScript (23 JS modules, no framework), bundled by esbuild
- **Build**: esbuild — content-hashed bundles in `public/dist/`
- **Real-time**: WebSocket (`ws`) with long-polling fallback
- **Auth**: Session-based with Bearer tokens and HttpOnly cookies (bcryptjs for password hashing)
- **Validation**: Zod schemas on all API inputs
- **Security**: Helmet (security headers), express-rate-limit, compression, structured security event logging
- **Logging**: Pino (structured logging, pino-pretty in dev)
- **Testing**: Playwright E2E tests (216 tests across 15 spec files)
- **API**: REST API with JSON responses
- **Deployment**: Vercel-ready (`vercel.json`, serverless export in `api/index.js`)

**Key Features:**
- Multi-user authentication with admin approval workflow
- Role-based access control (admin, user roles)
- Team collaboration with workspace toggle (personal/team views)
- Project and task management with status tracking (backlog, not-started, in-progress, completed)
- Kanban board with drag-and-drop and configurable WIP limits per lane
- Document attachments (email and docx types) with download support
- Project archiving
- Stakeholder assignment and filtering
- Priority levels (high, medium, low, none) with color-coded indicators: High (red), Medium (yellow), Low (green), None (gray)
- Tag-based organization and filtering
- Due date tracking with overdue/today/this week smart filters
- Quick inline editing with undo functionality (change status, priority, or stakeholder without opening a modal)
- Multiple sorting options (manual, due date, priority, title, stakeholder, recently updated)
- Command palette for quick navigation (Cmd+K / Ctrl+K)
- Theme system with CSS custom properties (Light, Dark, Ocean, Forest, Auto)
- Statistics dashboard
- Quick notes (scratch pad, per-user)
- Export/import functionality for data backup (user-scoped)
- Project templates (Bug Report, Feature Request, Meeting Notes)
- Admin panel for user management and global settings
- Live full-text search across project titles and descriptions
- Sidebar collapse for reclaiming screen space

## User Guide

### Views and Navigation

| View | What It Shows |
|------|--------------|
| All Projects | Every project, sorted and filtered to your preferences |
| Kanban | Four drag-and-drop lanes (`backlog → completed`) with configurable WIP limits |
| Focus | Your highest-priority in-progress work |
| Status filters | Jump directly to any status bucket |

**Filters available:** status, priority, stakeholder, tag, smart filters (Overdue, Due Today, Due This Week)

**Sort options:** manual order, due date, priority, title, stakeholder, recently updated

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `N` | New project |
| `Cmd+K` / `Ctrl+K` | Command palette |
| `/` | Focus search |
| `Cmd+I` / `Ctrl+I` | Statistics |
| `Cmd+,` / `Ctrl+,` | Settings |
| `Esc` | Close modal |
| `?` | Show all shortcuts |

### Solo Use Workflow

1. Log in at `http://localhost:3001` with admin credentials
2. Press `N` or click **+ New Project** to create a project
3. Fill in: status, priority, due date, description, tags
4. Add tasks at the bottom of the project modal — press Enter after each one
5. Use **Overdue** and **Due Today** sidebar filters each morning
6. Archive projects when done to keep the active list clean
7. Open Settings → **Export Data** for JSON backups

### Team Use Workflow

1. Have teammates register at `/register` — approve them from `/admin.html`
2. Go to Settings → Team → **Create Team**, then **Add Member** with each teammate's username
3. Each user toggles **Personal / Team** in the top nav bar independently
4. **Team mode**: shows all team members' projects — for stand-ups and shared visibility
5. **Personal mode**: shows only your own projects — for focused individual work
6. Use tag + stakeholder filters to slice the team view (e.g., `backend` tag + specific owner)
7. Admin configures global limits in Admin Panel (max projects per user, registration on/off)

## Architecture

### Design Philosophy

Project Overviewer is intentionally simple. The goal is a tool you can run, understand, and modify without fighting complex abstraction layers. There is no framework on the frontend, no ORM on the backend, and no external services — just Node.js, SQLite, and plain JavaScript files. The build step (esbuild) is minimal and automatic via `npm start`.

### System Overview

```
┌─────────────────────────────────────────────────┐
│                   Browser                        │
│   public/index.html + esbuild bundles + CSS      │
└──────────────────────┬──────────────────────────┘
                       │ HTTP REST (JSON)
┌──────────────────────▼──────────────────────────┐
│              server.js  (Express)                │
│   Helmet → Rate Limit → requireAuth → Zod       │
│   → Route Handler → database.js                 │
└──────────────────────┬──────────────────────────┘
                       │ async/await
┌──────────────────────▼──────────────────────────┐
│           database.js  (@libsql/client)          │
│   waitForDb() → Promise wrappers → CRUD         │
└──────────────────────┬──────────────────────────┘
                       │ WAL mode
┌──────────────────────▼──────────────────────────┐
│               projects.db  (SQLite file)         │
└─────────────────────────────────────────────────┘
```

### Four-Tier Structure

1. **Presentation Layer** (`public/`)
   - `public/index.html` — HTML shell, loads esbuild bundles from `public/dist/` and CSS
   - `public/login.html`, `public/register.html`, `public/admin.html` — Auth pages
   - `public/css/app.css` — Main application styles with CSS custom properties
   - `public/css/auth.css` — Auth page styles
   - `public/css/theme.css` — Theme variables
   - `public/dist/` — esbuild content-hashed bundles (3 bundles: boot, app-shell, app)
   - 23 JS source modules in `public/js/` (see Frontend Modules below)

2. **Auth & Middleware Layer** (`server.js`)
   - `requireAuth` middleware — validates session tokens (Bearer header or cookie)
   - `requireAdmin` middleware — checks admin role
   - Zod input validation schemas
   - Rate limiting (general, auth, import — disabled in `NODE_ENV=test`)
   - Helmet security headers, compression, body size limits

3. **API Layer** (`server.js` + `routes/`)
   - Express.js REST API with route handlers organized in `routes/` directory
   - 12 route modules: admin, auth, documents, export-import, notes, projects, settings, shared, tasks, teams, templates, webhooks
   - All data endpoints require authentication
   - User-scoped data isolation (all queries include `user_id`)
   - Team-aware reads via `workspaceMode` setting
   - All endpoints prefixed with `/api/`

4. **Data Layer** (`database.js`)
   - LibSQL (`@libsql/client`) database abstraction with WAL mode
   - Promise-based query wrappers (`run`, `get`, `all`)
   - Database initialization and schema setup
   - Eleven tables: `users`, `sessions`, `projects`, `tasks`, `documents`, `global_settings`, `user_settings`, `quick_notes`, `templates`, `teams`, `team_members`

### Key Design Patterns

**Database Access Pattern:**
- All database functions are async and await `waitForDb()` before executing
- This ensures the database schema is initialized before any queries run
- UUID-based IDs for all entities (generated via `crypto.randomUUID()`)
- SQLite WAL mode with performance PRAGMAs (`synchronous = NORMAL`, `cache_size = -8000`, `busy_timeout = 5000`)

**Authentication Pattern:**
- Registration requires admin approval before login is allowed
- Sessions stored in database with 24-hour expiry
- Token passed via `Authorization: Bearer <token>` header or `session_token` HttpOnly cookie
- Admin user seeded from `ADMIN_USER` / `ADMIN_PASS` env vars on first startup
- Expired sessions cleaned on startup

**Data Isolation Pattern:**
- All project/task/note/setting queries include `user_id` parameter
- Team mode: queries expand to include all team members' user IDs
- Workspace mode setting (`personal` or `team`) controls data scope

**API Response Pattern:**
- Success: Returns JSON data with appropriate HTTP status codes
- Error: Returns `{ error: "message" }` with 4xx/5xx status codes
- All endpoints follow RESTful conventions

**Frontend Module Pattern:**
- Each module attaches its exports to `window` (e.g., `window.API`, `window.AppState`, `window.WS`, `window.Polling`)
- Modules are bundled by esbuild into 3 bundles (boot, app-shell, app); globals make inter-module communication explicit
- State managed in `state.js` closure, accessed via `window.AppState`

### Frontend Architecture

The frontend is a **modular vanilla JavaScript SPA bundled by esbuild**. 23 source modules in `public/js/` are organized into 3 bundles (boot, app-shell, app) output to `public/dist/` with content hashes. Each module attaches its public API to `window` (e.g., `window.API`, `window.AppState`, `window.WS`). No `import`/`export` — globals make the dependency graph explicit within each bundle.

**State management**: `state.js` is a closure holding the application state (projects array, user settings, current user, active filters). Modules mutate state through explicit setters (`AppState.setProjects()`, `AppState.updateSettings()`) and then call render functions directly. No reactive system — data flow is explicit and debugger-traceable.

**Event handling**: `events.js` uses **event delegation** — a single listener per major container (`#app`, `#projectModal`, etc.) handles all interactions via `event.target` matching. Two shared helpers inside `events.js` prevent duplication:
- `handleDocAction(e, projectId)` — processes document-related clicks in both content area and modal
- `wireTaskDrag(container)` — sets up task drag-and-drop in both card view and modal view

### Frontend Modules

Located in `public/js/`, bundled into 3 esbuild outputs:

| Module | Responsibility |
|--------|---------------|
| `boot.js` | Entry-point router: detects page (login, register, admin, main) and loads the correct bundle |
| `index-guard.js` | Auth guard for protected pages — verifies session before rendering |
| `api-client.js` | All `fetch()` calls with auth headers and error handling (`window.API`) |
| `utils.js` | Date formatting, debounce, DOM helpers |
| `state.js` | Central app state: projects, settings, current user (`window.AppState`) |
| `toast.js` | Toast notification system |
| `theme.js` | CSS custom property swapping for 5 themes |
| `filters.js` | Search, filter, and sort logic (pure functions, no side effects) |
| `render.js` | DOM construction: project cards, kanban lanes, task lists |
| `projects.js` | Project CRUD: create, update, delete, reorder |
| `tasks.js` | Task CRUD: create, toggle, update, delete, reorder |
| `modals.js` | Modal lifecycle: open, populate, close, form submission |
| `commands.js` | Command palette (`Cmd+K`) |
| `dragdrop.js` | Kanban drag-and-drop (projects and tasks) |
| `keyboard.js` | Keyboard shortcut registry |
| `events.js` | Event delegation setup |
| `team.js` | Team management UI and workspace toggle |
| `ws-client.js` | WebSocket client for real-time sync (`window.WS`) |
| `polling.js` | Long-polling fallback when WebSocket is unavailable (`window.Polling`) |
| `app.js` | Bootstrap: load state, wire modules, initial render |
| `login-page.js` | Login page initialization and form handling |
| `register-page.js` | Registration page initialization and form handling |
| `admin-page.js` | Admin panel: user management, approvals, global settings |

## Development Commands

### Starting the Application

**Mac/Linux:**
```bash
./start.sh
```

**Windows:**
```bash
start.bat
```

**Direct start (after dependencies installed):**
```bash
npm start
# or
node server.js
```

The server runs on `http://localhost:3001` by default (configurable via `PORT` environment variable).

### Environment Configuration

Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

Key variables:
- `ADMIN_USER` / `ADMIN_PASS` — Admin account created on first startup
- `PORT` — Server port (default: 3001)
- `NODE_ENV` — `development` or `production` (controls Secure cookie flag, rate limiting)

### Installing Dependencies

```bash
npm install
```

Required dependencies:
- `express` — Web server framework
- `@libsql/client` — LibSQL/Turso database driver (SQLite-compatible, supports remote Turso or local file)
- `bcryptjs` — Password hashing (pure JS, no native binaries)
- `helmet` — Security headers
- `compression` — Response compression
- `express-rate-limit` — Rate limiting
- `zod` — Input validation
- `pino` — Structured logging
- `ws` — WebSocket server for real-time sync
- `dotenv` — Environment variable loading
- `mammoth` — DOCX document parsing

Dev dependencies:
- `@playwright/test` — E2E testing framework
- `esbuild` — Frontend bundler
- `pino-pretty` — Dev-friendly log formatting

### Running Tests

```bash
# Run all E2E tests
npm test
# or
npx playwright test

# Run tests with UI
npm run test:ui

# Run a specific test file
npx playwright test tests/e2e/auth.spec.js

# Run tests in headed mode
npx playwright test --headed
```

Test files in `tests/e2e/` (216 tests across 15 spec files):
- `auth.spec.js` — Authentication flows (register, login, logout, password change)
- `projects-tasks.spec.js` — Project and task CRUD
- `rbac.spec.js` — Role-based access control
- `security.spec.js` — Security hardening (headers, rate limits, validation)
- `security-hardening.spec.js` — Advanced security tests (CSP, HSTS, input sanitization)
- `teams.spec.js` — Team collaboration
- `ui-auth.spec.js` — UI authentication flows
- `subtasks.spec.js` — Subtask creation, completion, hierarchy
- `webhooks.spec.js` — Webhook CRUD and delivery
- `websocket.spec.js` — WebSocket real-time sync
- `caching.spec.js` — Cache headers and ETag behavior
- `versioning.spec.js` — Optimistic concurrency / version checks
- `theme-consistency.spec.js` — Theme switching and persistence
- `audit-fixes.spec.js` — Regression tests for audit findings
- `red-team-fixes.spec.js` — Regression tests for security fixes
- `helpers.js` — Shared test utilities

Additional test files:
- `tests/team-membership-migration.test.js` — Team membership data migration

### Database Operations

**Database file location:** `projects.db` in the project root

**Reset database:**
```bash
rm projects.db
# Restart server to recreate with fresh schema
```

**Inspect database:**
```bash
sqlite3 projects.db
sqlite> .tables
sqlite> .schema users
sqlite> SELECT id, username, role, approved FROM users;
sqlite> .quit
```

## Code Structure

### Backend Files

**`server.js`** — Express application entry point. Mounts middleware and route modules from `routes/`. Every request passes through the same middleware stack:
1. **Helmet** — security headers (CSP, X-Frame-Options, HSTS in production)
2. **Rate limiting** — 200 req/15 min general, 20 req/15 min auth, 5/hr imports
3. **Compression + body limits** — 2 MB general, 10 MB for uploads and imports
4. **`requireAuth`** — validates session token from Bearer header or HttpOnly cookie
5. **`requireAdmin`** — checks `admin` role (applied only to admin routes)
6. **Zod validation** — every endpoint that accepts input has a schema; invalid input returns 400 before business logic runs

**`routes/`** — Modular route handlers (12 files):
- `auth.js` — Registration, login, logout, password change, `/me`
- `admin.js` — User management, approvals, global settings
- `projects.js` — Project CRUD, reordering
- `tasks.js` — Task CRUD, reordering, subtasks
- `teams.js` — Team creation, membership, workspace mode
- `documents.js` — Document attachments, downloads
- `settings.js` — User settings CRUD
- `notes.js` — Quick notes
- `templates.js` — Project templates
- `export-import.js` — Data export/import
- `webhooks.js` — Webhook CRUD, test delivery
- `shared.js` — Shared middleware (`requireAuth`, `requireAdmin`, `setSessionCookie`, `resolveTeamScope`)

The SPA fallback at the bottom of `server.js` serves `public/index.html` for any non-API, non-static route.

**`database.js`** — The data access layer. The key pattern is `waitForDb()`: every exported function starts with `await waitForDb()`, guaranteeing the schema exists before any query runs, even during the startup window.

Schema initialization uses `CREATE TABLE IF NOT EXISTS` throughout — every startup is idempotent and safe against an existing database.

The project list endpoint uses a **bulk-fetch pattern**: 3 queries (all projects, all tasks, all documents) joined in JavaScript — replaces a 2N+1 query pattern.

SQLite performance configuration:
- WAL mode — readers don't block writers
- `synchronous = NORMAL` — durable without full `FULL` overhead
- `cache_size = -8000` — 8 MB page cache
- `busy_timeout = 5000` — wait up to 5 seconds on locked DB before failing

**`logger.js`** — Thin Pino wrapper. JSON output in production; pretty-printed colored output in development via `pino-pretty`. Level controlled by `LOG_LEVEL` env var.

**`event-bus.js`** — In-process event emitter for decoupling side effects (WebSocket broadcasts, webhook delivery) from route handlers.

**`ws-server.js`** — WebSocket server (`ws` library) for real-time sync. Broadcasts project/task/setting mutations to connected clients.

**`webhook-dispatcher.js`** — Dispatches HTTP webhook notifications on data events. HMAC-signed payloads with configurable URLs.

**`security-events.js`** — Structured security event logging. Captures auth events, rate limit violations, and suspicious activity to a dedicated log stream.

**`document-security.js`** — MIME type allowlisting and filename sanitization for document uploads/downloads.

**`password-policy.js`** — Password strength validation rules (length, complexity, common password checks).

**`session-config.js`** — Session configuration: token entropy, expiry durations, idle timeout. Values configurable via env vars.

**`app-constants.js`** — Shared constants (setting key allowlists, status values, etc.).

### Frontend Files

**`public/index.html`** — SPA HTML shell
- Loads esbuild bundles from `public/dist/` (boot, app-shell, app)
- Loads CSS from `public/css/` (app.css, theme.css)
- No inline JavaScript or CSS

**`public/login.html`** — Login page
**`public/register.html`** — Registration page
**`public/admin.html`** — Admin panel (user management)

**`public/css/app.css`** — Main application styles
- CSS custom properties for theming
- Five themes: Light, Dark, Ocean, Forest, Auto

**`public/css/auth.css`** — Auth page styles (login, register, admin)

**`public/js/api-client.js`** — Frontend API wrapper
- Centralizes all fetch calls with auth token headers
- Error handling and JSON parsing
- Exported as global `window.API` object

**`public/js/` (remaining modules)** — See Frontend Modules table above

### Configuration Files

**`.env.example`** — Environment variable template
**`playwright.config.js`** — Playwright E2E test configuration
**`vercel.json`** — Vercel deployment configuration (routes, serverless functions)
**`.nvmrc`** — Node.js version pin
**`.github/workflows/security.yml`** — CI security workflow (dependency review, npm audit)
**`.github/dependabot.yml`** — Dependabot config for npm and GitHub Actions
**`scripts/build-frontend.js`** — esbuild bundler: compiles `public/js/` → `public/dist/` with content hashes

### Startup Scripts

**`start.sh`** — Mac/Linux startup script
- Checks for Node.js installation
- Installs dependencies if `node_modules` missing
- Starts the server

**`start.bat`** — Windows startup script
- Same functionality as `start.sh` for Windows

## Database Schema

Ten tables in four logical groups:

| Group | Tables | Purpose |
|-------|--------|---------|
| Auth | `users`, `sessions` | Accounts, session tokens |
| Content | `projects`, `tasks`, `documents` | The actual work |
| Collaboration | `teams`, `team_members` | Team and membership |
| Configuration | `global_settings`, `user_settings`, `quick_notes`, `templates` | Per-user and global config |

**Key schema decisions:**
- **UUID primary keys** (`crypto.randomUUID()`) everywhere — avoids sequential ID enumeration attacks and simplifies data portability
- **User-scoped queries** — every content table has a `user_id` column; every read query filters by it (or expands to team member list in team mode)
- **JSON columns** for `tags`, template `tasks`, and email `payload` — avoids schema migrations for list/object-shaped fields
- **Cascade deletes** — deleting a user removes sessions; deleting a project cascades to tasks and documents
- **`project_order` / `task_order` integers** per record — manual ordering without a separate join table

### users table
```sql
id TEXT PRIMARY KEY              -- UUID
username TEXT UNIQUE NOT NULL
email TEXT UNIQUE NOT NULL
password_hash TEXT NOT NULL
role TEXT NOT NULL DEFAULT 'user' -- 'admin' or 'user'
approved INTEGER NOT NULL DEFAULT 0  -- Boolean: must be approved by admin to login
created_at TEXT DEFAULT CURRENT_TIMESTAMP
updated_at TEXT DEFAULT CURRENT_TIMESTAMP
```

### sessions table
```sql
id TEXT PRIMARY KEY
user_id TEXT NOT NULL             -- Foreign key to users(id)
token TEXT UNIQUE NOT NULL        -- 32-byte hex token
expires_at TEXT NOT NULL          -- 24-hour expiry
created_at TEXT DEFAULT CURRENT_TIMESTAMP
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
```

### projects table
```sql
id TEXT PRIMARY KEY              -- UUID
user_id TEXT NOT NULL            -- Foreign key to users(id), data isolation
title TEXT NOT NULL
stakeholder TEXT DEFAULT ''
description TEXT DEFAULT ''
status TEXT DEFAULT 'not-started'  -- backlog, not-started, in-progress, completed
priority TEXT DEFAULT 'medium'     -- high, medium, low, none
due_date TEXT                      -- ISO 8601 date string
tags TEXT DEFAULT '[]'             -- JSON array string
project_order INTEGER DEFAULT 0    -- For manual sorting
archived INTEGER DEFAULT 0        -- Boolean: 0 or 1
archived_at TEXT                   -- Timestamp when archived
created_at TEXT DEFAULT CURRENT_TIMESTAMP
updated_at TEXT DEFAULT CURRENT_TIMESTAMP
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
```

### tasks table
```sql
id TEXT PRIMARY KEY
project_id TEXT NOT NULL          -- Foreign key to projects(id)
title TEXT NOT NULL
completed INTEGER DEFAULT 0       -- Boolean: 0 or 1
due_date TEXT
notes TEXT DEFAULT ''
priority TEXT DEFAULT 'none'
recurring TEXT                    -- For future recurring tasks feature
blocked_by TEXT                   -- Task dependency reference
task_order INTEGER DEFAULT 0      -- For manual sorting
created_at TEXT DEFAULT CURRENT_TIMESTAMP
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
```

### documents table
```sql
id TEXT PRIMARY KEY
project_id TEXT NOT NULL          -- Foreign key to projects(id)
doc_type TEXT NOT NULL            -- 'email' or 'docx'
title TEXT DEFAULT ''
payload TEXT                      -- JSON for email documents
file_name TEXT                    -- For docx documents
mime_type TEXT                    -- For docx documents
content_base64 TEXT              -- Base64-encoded file content
created_at TEXT DEFAULT CURRENT_TIMESTAMP
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
```

### teams table
```sql
id TEXT PRIMARY KEY
name TEXT NOT NULL
created_by TEXT NOT NULL          -- Foreign key to users(id)
created_at TEXT DEFAULT CURRENT_TIMESTAMP
FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
```

### team_members table
```sql
team_id TEXT NOT NULL
user_id TEXT NOT NULL
role TEXT NOT NULL DEFAULT 'member'  -- 'owner' or 'member'
joined_at TEXT DEFAULT CURRENT_TIMESTAMP
PRIMARY KEY (team_id, user_id)
FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
```

### global_settings table
```sql
key TEXT PRIMARY KEY              -- Allowlisted keys only
value TEXT                        -- JSON-encoded value
```

Allowed keys: `registrationEnabled`, `maxProjectsPerUser`, `maxTasksPerProject`, `siteName`, `maintenanceMode`

### user_settings table
```sql
user_id TEXT NOT NULL
key TEXT NOT NULL                  -- Allowlisted keys only
value TEXT                         -- JSON-encoded value
PRIMARY KEY (user_id, key)
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
```

Allowed keys: `theme`, `defaultView`, `sortBy`, `showCompleted`, `showArchived`, `wipLimits`, `kanbanColumns`, `sidebarCollapsed`, `workspaceMode`

### quick_notes table
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
user_id TEXT NOT NULL
content TEXT DEFAULT ''
created_at TEXT DEFAULT CURRENT_TIMESTAMP
updated_at TEXT DEFAULT CURRENT_TIMESTAMP
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
```

### templates table
```sql
id TEXT PRIMARY KEY
name TEXT NOT NULL
tasks TEXT NOT NULL               -- JSON array of task titles
```

## API Endpoints

### Authentication
- `POST /api/auth/register` — Register new user (pending approval)
- `POST /api/auth/login` — Login (returns token + sets HttpOnly cookie)
- `POST /api/auth/logout` — Logout (requires auth)
- `GET /api/auth/me` — Get current user info (requires auth)
- `PUT /api/auth/password` — Change password (requires auth, invalidates other sessions)

### Admin (requires admin role)
- `GET /api/admin/users` — List all users
- `PUT /api/admin/users/:id/approve` — Approve user registration
- `PUT /api/admin/users/:id/role` — Change user role
- `DELETE /api/admin/users/:id` — Delete user
- `GET /api/admin/settings` — Get global settings
- `POST /api/admin/settings/:key` — Set global setting

### Teams (requires auth)
- `POST /api/teams` — Create team (user becomes owner)
- `GET /api/teams/mine` — Get current user's team
- `POST /api/teams/:id/members` — Add member by username (owner/admin only)
- `DELETE /api/teams/:id/members/:userId` — Remove member (owner/admin/self)
- `POST /api/teams/:id/leave` — Leave team (non-owners only)
- `DELETE /api/teams/:id` — Delete team (owner/admin only)

### Projects (requires auth, user-scoped)
- `GET /api/projects` — Get all projects with tasks (team-aware)
- `GET /api/projects/:id` — Get single project with tasks (team-aware)
- `POST /api/projects` — Create project
- `PUT /api/projects/:id` — Update project
- `DELETE /api/projects/:id` — Delete project (cascades to tasks and documents)
- `POST /api/projects/reorder` — Update project order (bulk)

### Tasks (requires auth, ownership-verified)
- `GET /api/projects/:projectId/tasks` — Get tasks for project
- `POST /api/projects/:projectId/tasks` — Create task
- `PUT /api/tasks/:id` — Update task
- `DELETE /api/tasks/:id` — Delete task
- `POST /api/projects/:projectId/tasks/reorder` — Reorder tasks

### Documents (requires auth, ownership-verified)
- `GET /api/projects/:projectId/documents` — List documents for project
- `POST /api/projects/:projectId/documents` — Create document (email or docx)
- `DELETE /api/documents/:id` — Delete document
- `GET /api/documents/:id/download` — Download document file

### Settings (requires auth)
- `GET /api/settings` — Get all user settings
- `GET /api/settings/:key` — Get single user setting
- `POST /api/settings/:key` — Set user setting

### Other (requires auth)
- `GET /api/notes` — Get quick notes content
- `POST /api/notes` — Save quick notes
- `GET /api/templates` — Get all templates
- `GET /api/export` — Export all user data as JSON
- `POST /api/import` — Import data from JSON (user-scoped, rate-limited)

### Health (no auth)
- `GET /api/health` — Database health check

## Common Development Tasks

### Adding a New API Endpoint

1. Add Zod validation schema in `server.js` (if endpoint accepts input)
2. Add route handler in `server.js` with `requireAuth` (and `requireAdmin` if needed)
3. Add database function in `database.js` (if needed), ensuring user-scoped queries
4. Add API client method in `public/js/api-client.js`
5. Update relevant frontend module in `public/js/` to call new endpoint

### Adding a Database Column

1. Add column in the `CREATE TABLE` statement in `initDatabase()` in `database.js`
2. Update relevant mapper function (e.g., `mapProject`, `mapTask`)
3. Update relevant CRUD functions to handle new field
4. Add Zod schema validation for the new field in `server.js`
5. Update API endpoints to accept/return new field
6. Update frontend module to display/edit new field

### Adding a Frontend Module

1. Create `public/js/module-name.js`
2. Attach exports to `window` (e.g., `window.ModuleName = { ... }`)
3. Add `<script src="/js/module-name.js"></script>` to `public/index.html` in correct load order
4. Reference from other modules via `window.ModuleName`

### Testing

```bash
# Run all tests
npm test

# Run specific test file
npx playwright test tests/e2e/auth.spec.js

# Run with browser visible
npx playwright test --headed

# Run with UI mode
npm run test:ui

# Debug a test
npx playwright test --debug
```

**Test notes:**
- Rate limiting is disabled when `NODE_ENV=test`
- `beforeAll` in Playwright does not receive the `request` fixture — use per-test login or helper functions
- Avoid `!` and special bash chars in password test strings
- Test helpers in `tests/e2e/helpers.js`

### Testing the API

Test manually with curl (auth required for most endpoints):
```bash
# Register a user
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","password":"password123"}'

# Login (save token)
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"yourpassword"}' | jq -r '.token')

# Get all projects (with auth)
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/projects

# Create a project
curl -X POST http://localhost:3001/api/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Test Project","status":"not-started"}'

# Health check (no auth needed)
curl http://localhost:3001/api/health
```

### Debugging

**Server-side errors:**
- Check terminal output where `node server.js` is running
- Pino structured logs (pretty-printed in dev)
- Set `LOG_LEVEL=debug` for verbose logging

**Database issues:**
- Delete `projects.db` and restart to recreate schema
- Use `sqlite3 projects.db` to inspect data directly
- Check for foreign key violations or constraint errors
- Database uses WAL mode — may have `-wal` and `-shm` files alongside `projects.db`

**Frontend issues:**
- Open browser DevTools (F12)
- Check Console tab for JavaScript errors
- Check Network tab for failed API calls (look for 401/403 for auth issues)
- API errors logged via `console.error()` in `public/js/api-client.js`

**Auth issues:**
- Check that user is approved (`approved = 1` in users table)
- Check session hasn't expired (24-hour expiry)
- Token must be in `Authorization: Bearer <token>` header or `session_token` cookie

## Important Notes

### Database Initialization
- The database uses a `waitForDb()` pattern to ensure schema is created before any queries
- Server startup waits for database initialization before listening on port
- Default templates are seeded on first run
- Admin user seeded from `ADMIN_USER`/`ADMIN_PASS` env vars (if set)
- Expired sessions cleaned on startup

### Data Persistence
- All data stored in SQLite database (`projects.db`) with WAL mode
- No in-memory storage or mock data
- Export/import features are user-scoped (each user exports only their data)

### Security

| Layer | Control |
|-------|---------|
| Transport | HSTS header in production; `Secure` cookie flag requires HTTPS |
| Headers | Helmet: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy |
| Rate limiting | 200 req/15 min general; 20 req/15 min auth; 5/hr import (disabled in `NODE_ENV=test`) |
| Passwords | bcrypt with 12 salt rounds |
| Sessions | 32-byte hex token; 24-hour expiry; invalidated on password change |
| Authorization | Every data endpoint verifies `user_id` ownership or team membership before returning data |
| Input | Zod schemas on all inputs; settings keys allowlisted server-side |
| File downloads | MIME type allowlisting; filename sanitization |
| Body limits | 2 MB general; 10 MB upload/import |

### Frontend Architecture
- Modular vanilla JavaScript — 16 modules in `public/js/`, no build step required
- Modules communicate via `window` globals (no import/export)
- Load order matters — dependencies must be loaded before dependents
- Global `API` object available for all fetch calls (includes auth token automatically)
- No state management library; state managed in `state.js`

### Team Collaboration
- Users can belong to one team at a time
- Team owner (creator) cannot leave — must delete team or transfer ownership
- Workspace mode setting controls whether team or personal data is shown
- Default workspace mode is `team` (shows all team members' projects)

### Graceful Shutdown
- Server handles `SIGINT` (Ctrl+C) and `SIGTERM`
- In-flight requests drained before shutdown
- Database connection closed cleanly on shutdown
- Force shutdown after 10-second timeout
- Safe to stop server without data loss

### Port Configuration
- Default port: 3001
- Override with environment variable: `PORT=4000 npm start`