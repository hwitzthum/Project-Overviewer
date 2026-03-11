# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Project Overviewer is a multi-user project and task management application with session-based authentication, role-based access control (RBAC), and team collaboration. It uses a client-server architecture with Express.js serving a modular single-page application (SPA) built with vanilla JavaScript.

**Technology Stack:**
- **Backend**: Node.js with Express.js
- **Database**: SQLite3 with WAL mode and promise-based wrappers
- **Frontend**: Modular vanilla JavaScript (16 JS modules, no framework, no bundler)
- **Auth**: Session-based with Bearer tokens and HttpOnly cookies (bcrypt for password hashing)
- **Validation**: Zod schemas on all API inputs
- **Security**: Helmet (security headers), express-rate-limit, compression
- **Logging**: Pino (structured logging, pino-pretty in dev)
- **Testing**: Playwright E2E tests
- **API**: REST API with JSON responses

**Key Features:**
- Multi-user authentication with admin approval workflow
- Role-based access control (admin, user roles)
- Team collaboration with workspace toggle (personal/team views)
- Project and task management with status tracking (backlog, not-started, in-progress, completed)
- Kanban board with drag-and-drop and configurable WIP limits per lane
- Document attachments (email and docx types) with download support
- Project archiving
- Stakeholder assignment and filtering
- Priority levels (high, medium, low, none) with color-coded indicators
- Tag-based organization and filtering
- Due date tracking with overdue/today/this week smart filters
- Quick inline editing with undo functionality
- Multiple sorting options (manual, due date, priority, title, stakeholder, recently updated)
- Command palette for quick navigation (Cmd+K / Ctrl+K)
- Theme system with CSS custom properties (Light, Dark, Ocean, Forest, Auto)
- Statistics dashboard
- Quick notes (scratch pad, per-user)
- Export/import functionality for data backup (user-scoped)
- Project templates (Bug Report, Feature Request, Meeting Notes)
- Admin panel for user management and global settings

## Architecture

### Four-Tier Structure

1. **Presentation Layer** (`public/`)
   - `public/index.html` — HTML shell (383 lines), loads JS modules and CSS
   - `public/login.html`, `public/register.html`, `public/admin.html` — Auth pages
   - `public/css/app.css` — Main application styles with CSS custom properties
   - `public/css/auth.css` — Auth page styles
   - 16 JS modules in `public/js/` (see Frontend Modules below)

2. **Auth & Middleware Layer** (`server.js`)
   - `requireAuth` middleware — validates session tokens (Bearer header or cookie)
   - `requireAdmin` middleware — checks admin role
   - Zod input validation schemas
   - Rate limiting (general, auth, import — disabled in `NODE_ENV=test`)
   - Helmet security headers, compression, body size limits

3. **API Layer** (`server.js`)
   - Express.js REST API handles all HTTP endpoints
   - All data endpoints require authentication
   - User-scoped data isolation (all queries include `user_id`)
   - Team-aware reads via `workspaceMode` setting
   - All endpoints prefixed with `/api/`

4. **Data Layer** (`database.js`)
   - SQLite3 database abstraction with WAL mode
   - Promise-based query wrappers (`run`, `get`, `all`)
   - Database initialization and schema setup
   - Ten tables: `users`, `sessions`, `projects`, `tasks`, `documents`, `global_settings`, `user_settings`, `quick_notes`, `templates`, `teams`, `team_members`

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
- Each module attaches its exports to `window` (e.g., `window.API`, `window.AppState`)
- No bundler — modules loaded via `<script>` tags in dependency order
- State managed in `state.js` closure, accessed via `window.AppState`

### Frontend Modules

Located in `public/js/`, loaded in this order:

| Module | Purpose |
|--------|---------|
| `api-client.js` | API wrapper (`window.API`), all fetch calls with auth headers |
| `utils.js` | Shared utilities (date formatting, debounce, etc.) |
| `state.js` | Application state management (`window.AppState`) |
| `toast.js` | Toast notification system |
| `theme.js` | Theme switching (Light, Dark, Ocean, Forest, Auto) |
| `filters.js` | Search, filter, and sort logic |
| `render.js` | DOM rendering for project cards, kanban, etc. |
| `projects.js` | Project CRUD operations |
| `tasks.js` | Task CRUD operations |
| `modals.js` | Modal dialogs (project edit, settings, etc.) |
| `commands.js` | Command palette (Cmd+K / Ctrl+K) |
| `dragdrop.js` | Kanban drag-and-drop |
| `keyboard.js` | Keyboard shortcuts |
| `events.js` | Event listener setup and delegation |
| `team.js` | Team management UI and workspace toggle |
| `app.js` | App initialization and bootstrap |

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
- `sqlite3` — Database driver
- `bcrypt` — Password hashing
- `helmet` — Security headers
- `compression` — Response compression
- `express-rate-limit` — Rate limiting
- `zod` — Input validation
- `pino` — Structured logging

Dev dependencies:
- `@playwright/test` — E2E testing framework
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

Test files in `tests/e2e/`:
- `auth.spec.js` — Authentication flows (register, login, logout, password change)
- `projects-tasks.spec.js` — Project and task CRUD
- `rbac.spec.js` — Role-based access control
- `security.spec.js` — Security hardening (headers, rate limits, validation)
- `teams.spec.js` — Team collaboration
- `ui-auth.spec.js` — UI authentication flows
- `helpers.js` — Shared test utilities

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

**`server.js`** — Express application, middleware, and route handlers
- Security middleware: Helmet, rate limiting, compression, body size limits
- Auth middleware: `requireAuth`, `requireAdmin`
- Input validation with Zod schemas
- Cookie parsing (built-in, no extra dependency)
- Auth endpoints: register, login, logout, me, password change
- Admin endpoints: user management, global settings
- Team endpoints: create, get, add/remove members, leave, delete
- Project CRUD endpoints (user-scoped)
- Task CRUD endpoints (ownership-verified)
- Document endpoints with file download
- Settings endpoints (user and global)
- Quick notes, templates, export/import
- Admin user seeding from env vars
- SPA fallback routing
- Graceful shutdown with 10s timeout

**`database.js`** — Database abstraction layer
- Connection management with `waitForDb()` pattern
- WAL mode and performance PRAGMAs
- Schema initialization for all 10+ tables with indexes
- User and session management
- User-scoped CRUD operations for projects, tasks, documents
- Team management (create, members, lookup)
- Dual settings system: global (admin) and per-user
- Bulk-fetch optimization (3 queries instead of 2N+1 for projects)
- User-scoped export/import
- Health check endpoint support
- Foreign key constraints with cascade deletion

**`logger.js`** — Pino structured logger configuration
- Log level from `LOG_LEVEL` env var (default: `info`)
- Pretty printing in non-production environments

### Frontend Files

**`public/index.html`** — SPA HTML shell
- Minimal HTML structure (383 lines)
- Loads CSS from `public/css/`
- Loads 16 JS modules from `public/js/` in dependency order
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

### Startup Scripts

**`start.sh`** — Mac/Linux startup script
- Checks for Node.js installation
- Installs dependencies if `node_modules` missing
- Starts the server

**`start.bat`** — Windows startup script
- Same functionality as `start.sh` for Windows

## Database Schema

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
- Helmet sets security headers (CSP, X-Frame-Options, etc.)
- Rate limiting: 200 req/15min general, 20 req/15min auth, 5 req/hr import
- Rate limiting disabled in `NODE_ENV=test`
- Body size limits: 2MB general, 10MB for import and document uploads
- Zod validation on all API inputs with allowlisted settings keys
- Passwords hashed with bcrypt (12 rounds)
- MIME type allowlisting for document downloads
- Filename sanitization for downloads

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