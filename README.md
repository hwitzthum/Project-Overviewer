# Project Overviewer

**A self-hosted, multi-user project and task management application built for individuals and teams.**

No subscriptions. No cloud lock-in. Runs on your machine in under two minutes.

---

## What You Get

Project Overviewer is a complete project management tool packaged as a single Node.js application. It covers everything from personal task tracking to team-wide project visibility — all stored in a local SQLite database that you own.

### Project & Task Management

- Create projects with full metadata: status, priority, due date, stakeholder, description, and tags
- Four statuses: `backlog`, `not-started`, `in-progress`, `completed`
- Four priority levels with color-coded indicators: High (red), Medium (yellow), Low (green), None (gray)
- Attach tasks to any project — each task has its own priority, due date, and notes
- Drag-and-drop reordering for both projects and tasks
- Quick inline editing with undo — change status, priority, or stakeholder without opening a modal
- Document attachments: email documents with metadata, or upload `.docx` files and download them later
- Project archiving to keep your active workspace uncluttered

### Views and Navigation

| View | What It Shows |
|------|--------------|
| All Projects | Every project, sorted and filtered to your preferences |
| Kanban | Four drag-and-drop lanes (`backlog → completed`) with configurable WIP limits |
| Focus | Your highest-priority in-progress work |
| Status filters | Jump directly to any status bucket |

- **Command palette** (`Cmd+K` / `Ctrl+K`): navigate, create, or switch themes without touching the mouse
- **Search**: live full-text search across project titles and descriptions
- **Smart filters**: Overdue, Due Today, Due This Week
- **Filter by**: status, priority, stakeholder, or any tag
- **Sort by**: manual order, due date, priority, title, stakeholder, or recently updated
- **Sidebar collapse**: reclaim screen space with one click

### Personalization

- Five themes: Light, Dark, Ocean, Forest, Auto (follows system preference)
- Per-user settings saved server-side — your preferences follow you across devices
- Quick Notes: per-user scratch pad always accessible from the sidebar
- Statistics dashboard: visual breakdown of project distribution and task completion

### Data Portability

- Export all your data as a JSON file at any time
- Import data to restore or migrate a workspace
- Three built-in project templates: Bug Report, Feature Request, Meeting Notes

---

### Multi-User & Team Features

**Authentication**
- Secure registration with admin approval before first login
- Session-based auth with 24-hour expiry (Bearer token + HttpOnly cookie)
- Password change invalidates all other active sessions automatically

**Role-Based Access Control**
- `admin`: full user management, approval workflow, global settings
- `user`: manages own projects, participates in a team

**Team Collaboration**
- Create a team and invite members by username
- **Workspace toggle**: each user switches independently between Personal view (own projects) and Team view (all team members' projects)
- Team owners manage membership; members can leave at any time
- Owner can disband the team

**Admin Panel** (`/admin.html`)
- Approve or reject pending registrations
- Promote / demote user roles
- Configure global settings: registration on/off, project limits per user, site name, maintenance mode

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later — nothing else required (SQLite is bundled)

### 1. Clone and install

```bash
git clone <repo-url> project-overviewer
cd project-overviewer
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` to set your admin credentials:

```env
ADMIN_USER=admin
ADMIN_PASS=your-secure-password
PORT=3001
NODE_ENV=development
```

> The admin account is created automatically on first startup from these values.

### 3. Start the server

**Mac / Linux:**
```bash
./start.sh
```

**Windows:**
```bash
start.bat
```

**Direct:**
```bash
npm start
```

### 4. Open the app

Go to **http://localhost:3001** and log in with your admin credentials.

The SQLite database (`projects.db`) is created automatically. That's all there is to it.

---

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ADMIN_USER` | — | Admin username seeded on first startup |
| `ADMIN_PASS` | — | Admin password seeded on first startup |
| `PORT` | `3001` | HTTP port |
| `NODE_ENV` | `development` | `development` or `production` |
| `LOG_LEVEL` | `info` | Pino log level: `debug`, `info`, `warn`, `error` |

> In `production`, cookies require HTTPS (`Secure` flag), rate limiting is fully enforced, and logs are JSON. In `development`, HTTP cookies work and logs are pretty-printed.

---

### Running Tests

```bash
npm test                                      # Full E2E suite (Playwright)
npm run test:ui                               # Playwright interactive UI
npx playwright test --headed                  # Watch tests in browser
npx playwright test tests/e2e/auth.spec.js    # Single spec file
```

93 E2E tests covering auth, CRUD, RBAC, security headers, team management, and UI flows.

---

## Using Project Overviewer

### Solo Use

**Day one setup:**

1. Log in with your admin account at `http://localhost:3001`
2. Press `N` or click **+ New Project** to create your first project
3. Open it and fill in the details: status, priority, due date, description, tags
4. Add tasks at the bottom of the project modal — press Enter after each one

**Staying on top of your work:**

- Use the **Overdue** and **Due Today** sidebar filters each morning to see what needs attention
- The **Kanban view** gives a visual pipeline — drag a project card from `not-started` across to `completed` as it progresses
- **Archive** projects when they're done so your active list stays clean (use "Show Archived" to revisit them)
- Press `Cmd+K` to open the command palette for fast navigation without switching hands from the keyboard
- The **Statistics** view (`Cmd+I`) shows an instant health check of your project portfolio

**Keyboard shortcuts:**

| Shortcut | Action |
|----------|--------|
| `N` | New project |
| `Cmd+K` / `Ctrl+K` | Command palette |
| `/` | Focus search |
| `Cmd+I` / `Ctrl+I` | Statistics |
| `Cmd+,` / `Ctrl+,` | Settings |
| `Esc` | Close modal |
| `?` | Show all shortcuts |

**Backing up your data:**

Open Settings and click **Export Data** to download a full JSON backup. Store it somewhere safe. You can import it at any time to restore your workspace.

---

### Team Use

**Step 1 — Register your teammates**

Have each team member go to `/register` and create an account. You (the admin) approve them from the **Admin Panel** at `/admin.html`.

**Step 2 — Create and populate a team**

1. Log in and go to **Settings → Team**
2. Click **Create Team** and give it a name
3. Click **Add Member** and enter each teammate's username

**Step 3 — Switch to Team view**

Each user has a **Personal / Team** toggle in the top navigation bar.

- **Team mode**: shows all projects owned by every team member — great for stand-ups, planning, and shared visibility
- **Personal mode**: shows only your own projects — great for focused individual work

The toggle is per-user and persisted as a setting, so everyone controls their own view independently.

**A practical team workflow:**

1. Each person creates and owns their own projects — they are the accountable party
2. Set the **Stakeholder** field to identify who requested or depends on each project
3. Tag projects by initiative, quarter, or sprint: `Q2-2025`, `backend`, `sprint-12`
4. During stand-ups, everyone switches to Team view — the Kanban shows all work in one pipeline
5. Use tag and stakeholder filters to focus the view: "show me everything tagged `backend` owned by anyone"
6. The admin configures global limits (max projects per user) in the Admin Panel to keep the workspace manageable

**Admin responsibilities during team operation:**
- Check the Admin Panel weekly for pending user registrations
- Use **Global Settings** to pause new registrations once the team is fully onboarded
- Remove users from the admin panel if they leave — their projects remain and can be reassigned

---

## Architecture Guide

### Design Philosophy

Project Overviewer is intentionally simple. The goal is a tool you can run, understand, and modify without fighting a complex build pipeline or abstraction layers. There is no framework on the frontend, no ORM on the backend, and no external services — just Node.js, SQLite, and plain JavaScript files.

### System Overview

```
┌─────────────────────────────────────────────────┐
│                   Browser                        │
│   public/index.html + 16 JS modules + CSS       │
└──────────────────────┬──────────────────────────┘
                       │ HTTP REST (JSON)
┌──────────────────────▼──────────────────────────┐
│              server.js  (Express)                │
│   Helmet → Rate Limit → requireAuth → Zod       │
│   → Route Handler → database.js                 │
└──────────────────────┬──────────────────────────┘
                       │ async/await
┌──────────────────────▼──────────────────────────┐
│             database.js  (SQLite3)               │
│   waitForDb() → Promise wrappers → CRUD         │
└──────────────────────┬──────────────────────────┘
                       │ WAL mode
┌──────────────────────▼──────────────────────────┐
│               projects.db  (SQLite file)         │
└─────────────────────────────────────────────────┘
```

### Backend

**`server.js`** — The entire Express application in one file, organized in clearly labeled sections.

Every request passes through the same middleware stack before reaching a route handler:
1. **Helmet** — sets security headers (CSP, X-Frame-Options, HSTS in production)
2. **Rate limiting** — 200 req/15 min general, 20 req/15 min auth endpoints, 5/hr imports
3. **Compression + body limits** — 2 MB general, 10 MB for uploads and imports
4. **`requireAuth`** — validates session token from Bearer header or HttpOnly cookie
5. **`requireAdmin`** — checks the `admin` role (applied only to admin routes)
6. **Zod validation** — every endpoint that accepts input has a schema; invalid input returns 400 before business logic runs

Two shared helpers reduce duplication across routes:
- `setSessionCookie(res, token)` — used by login, password-change, and logout
- `resolveTeamScope(userId, workspaceMode)` — returns the list of user IDs to query (personal: just `[userId]`; team: all team member IDs)

The SPA fallback at the bottom of `server.js` serves `public/index.html` for any route that is not an API endpoint or static asset, enabling client-side navigation to work correctly on refresh.

**Why one file?** At this codebase size, a single organized file is faster to navigate than a controller/router split. If the application grows significantly, splitting by domain (auth, projects, teams) is the natural next step.

**`database.js`** — The data access layer.

The key pattern is `waitForDb()`: every exported function starts with `await waitForDb()`. This awaits a promise that resolves once `initDatabase()` completes on startup. The result: the schema is guaranteed to exist before any query runs, even if a request arrives during the startup window.

Schema initialization uses `CREATE TABLE IF NOT EXISTS` throughout, making every startup idempotent and safe to run against an existing database.

The project list endpoint uses a **bulk-fetch pattern**: load all projects, all tasks, and all documents in three queries, then join them in JavaScript. This replaces what would otherwise be a 2N+1 query pattern (one query per project for tasks, one per project for documents).

SQLite is configured for reliable concurrent access:
- WAL mode — readers don't block writers
- `synchronous = NORMAL` — durable without the overhead of full `FULL` mode
- `cache_size = -8000` — 8 MB page cache
- `busy_timeout = 5000` — wait up to 5 seconds on a locked database before failing

**`logger.js`** — Thin Pino wrapper. JSON output in production; pretty-printed colored output in development via `pino-pretty`. Level controlled by `LOG_LEVEL` env var.

### Frontend Architecture

The frontend is a **modular vanilla JavaScript SPA with no build step**.

**Why no framework?** Project Overviewer is a focused, single-purpose tool. The DOM surface is manageable, and the overhead of a build pipeline (webpack, Vite, React) would add complexity and fragility without meaningful benefit at this scale.

**Module loading**: 16 modules are loaded as plain `<script>` tags in `public/index.html`, in dependency order. Each module attaches its public API to `window` (e.g., `window.API`, `window.AppState`). No `import`/`export` — globals are appropriate for non-bundled scripts and make the dependency graph explicit.

**Module responsibilities (in load order):**

| Module | Responsibility |
|--------|---------------|
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
| `app.js` | Bootstrap: load state, wire modules, initial render |

**State management**: `state.js` is a closure holding the application state (projects array, user settings, current user, active filters). Modules mutate state through explicit setters (`AppState.setProjects()`, `AppState.updateSettings()`) and then call render functions directly. There is no reactive system — data flow is explicit and easy to trace with a debugger.

**Event handling**: `events.js` uses **event delegation** — a single listener per major container (`#app`, `#projectModal`, etc.) handles all interactions via `event.target` matching. This avoids the memory and bug risk of attaching individual listeners to every interactive element across dynamic DOM.

Two shared helpers inside `events.js` prevent code duplication:
- `handleDocAction(e, projectId)` — processes document-related clicks in both the content area and the project modal
- `wireTaskDrag(container)` — sets up task drag-and-drop in both the card view and modal view

### Database Schema

Ten tables in four logical groups:

| Group | Tables | Purpose |
|-------|--------|---------|
| Auth | `users`, `sessions` | Accounts, session tokens |
| Content | `projects`, `tasks`, `documents` | The actual work |
| Collaboration | `teams`, `team_members` | Team and membership |
| Configuration | `global_settings`, `user_settings`, `quick_notes`, `templates` | Per-user and global config |

**Key decisions:**

- **UUID primary keys** (`crypto.randomUUID()`) everywhere — avoids sequential ID enumeration attacks and simplifies future data portability
- **User-scoped queries** — every content table has a `user_id` column; every read query filters by it (or expands to the team member list in team mode)
- **JSON columns** for `tags`, template `tasks`, and email `payload` — avoids schema migrations for fields that are naturally list- or object-shaped
- **Cascade deletes** — deleting a user removes their sessions; deleting a project cascades to tasks and documents; foreign key constraints enforce referential integrity
- **`project_order` / `task_order` integers** per record — manual ordering without a separate sort-order join table

### Security Model

| Layer | Control |
|-------|---------|
| Transport | HSTS header in production; `Secure` cookie flag requires HTTPS |
| Headers | Helmet: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy |
| Rate limiting | 200 req/15 min general; 20 req/15 min auth; 5/hr import |
| Passwords | bcrypt with 12 salt rounds |
| Sessions | 32-byte hex token; 24-hour expiry; invalidated on password change |
| Authorization | Every data endpoint verifies `user_id` ownership or team membership before returning data |
| Input | Zod schemas on all inputs; settings keys allowlisted server-side |
| File downloads | MIME type allowlisting; filename sanitization |
| Body limits | 2 MB general; 10 MB upload/import |

---

## Project Structure

```
project-overviewer/
├── server.js              # Express app — all routes, middleware, auth
├── database.js            # SQLite data layer — schema, CRUD, bulk queries
├── logger.js              # Pino logger configuration
├── package.json
├── .env.example           # Environment variable template
├── start.sh               # Mac/Linux startup script
├── start.bat              # Windows startup script
├── projects.db            # SQLite database (auto-created on first run)
│
├── public/
│   ├── index.html         # SPA HTML shell (loads 16 JS modules)
│   ├── login.html         # Login page
│   ├── register.html      # Registration page
│   ├── admin.html         # Admin panel (user management, global settings)
│   ├── css/
│   │   ├── app.css        # Main styles with CSS custom properties (5 themes)
│   │   └── auth.css       # Auth page styles
│   └── js/
│       ├── api-client.js  # window.API — fetch wrapper with auth
│       ├── utils.js       # Shared utilities
│       ├── state.js       # window.AppState — central state management
│       ├── toast.js       # Toast notifications
│       ├── theme.js       # Theme switcher
│       ├── filters.js     # Search / filter / sort (pure functions)
│       ├── render.js      # DOM rendering
│       ├── projects.js    # Project CRUD
│       ├── tasks.js       # Task CRUD
│       ├── modals.js      # Modal dialogs
│       ├── commands.js    # Command palette (Cmd+K)
│       ├── dragdrop.js    # Kanban drag-and-drop
│       ├── keyboard.js    # Keyboard shortcuts
│       ├── events.js      # Event delegation
│       ├── team.js        # Team management UI
│       └── app.js         # App bootstrap
│
└── tests/
    └── e2e/
        ├── auth.spec.js           # Auth flows
        ├── projects-tasks.spec.js # Project and task CRUD
        ├── rbac.spec.js           # Role-based access control
        ├── security.spec.js       # Security headers, rate limits, validation
        ├── teams.spec.js          # Team collaboration
        ├── ui-auth.spec.js        # UI auth flows
        └── helpers.js             # Shared test utilities
```

---

## Troubleshooting

**App won't start**
- Verify Node.js ≥ 18: `node --version`
- Try `rm -rf node_modules && npm install`
- Check if port 3001 is in use: `lsof -i :3001`

**Can't log in**
- Confirm `ADMIN_USER` and `ADMIN_PASS` are set in `.env`
- If you changed the password, the old session token is invalid — log in again
- New user accounts require admin approval before they can log in

**Database issues**
- To reset completely: `rm projects.db` then restart — schema recreates automatically
- Inspect directly: `sqlite3 projects.db` then `.tables` or `SELECT * FROM users;`
- WAL mode creates companion files (`projects.db-wal`, `projects.db-shm`) — these are normal

**Projects not showing in Team view**
- Check that the workspace toggle (top nav bar) is set to **Team**
- Confirm all team members have been added via Settings → Team → Add Member

---

## License

MIT