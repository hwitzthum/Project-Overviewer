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
APP_ORIGIN=http://localhost:3001
TRUST_PROXY=false
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
| `APP_ORIGIN` | `http://localhost:3001` in local `.env` | Canonical origin used for same-origin checks and secure cookies |
| `TRUST_PROXY` | `false` locally | Reverse-proxy trust setting. Use the real proxy hop count or trusted subnet list only |
| `LOG_LEVEL` | `info` | Pino log level: `debug`, `info`, `warn`, `error` |

> In `production`, cookies require HTTPS (`Secure` flag), rate limiting is fully enforced, and logs are JSON. In `development`, HTTP cookies work and logs are pretty-printed.

### Production origin and proxy settings

Set these explicitly in production:

```env
NODE_ENV=production
APP_ORIGIN=https://your-real-domain.example
TRUST_PROXY=1
```

- Use `TRUST_PROXY=1` only when the app is behind exactly one trusted reverse proxy.
- If your deployment has multiple proxy hops, set the exact hop count or a specific trusted subnet list instead.
- On Vercel, the app will fall back to `https://${VERCEL_PROJECT_PRODUCTION_URL}` for `APP_ORIGIN` and `1` for `TRUST_PROXY` if you do not override them.
- `TRUST_PROXY=true` is intentionally rejected in production because it trusts arbitrary forwarded headers.

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

## User Guide

### Solo Use: Personal Task Management

Project Overviewer works perfectly for an individual managing their own projects and tasks. Here's how to get started and stay organized.

#### Getting Started

1. **Log in** with your admin credentials at `http://localhost:3001`
2. Press `N` (or click **+ New Project**) to create your first project
3. Fill in the project details:
   - **Title** — what you're working on
   - **Status** — backlog, not-started, in-progress, or completed
   - **Priority** — high, medium, low, or none (color-coded for quick scanning)
   - **Due Date** — optional, used for smart filters and sorting
   - **Description** — any notes, context, or acceptance criteria
   - **Tags** — free-form labels for organization (e.g., `urgent`, `research`, `cleanup`)
4. Add tasks directly in the project modal — press Enter after each one

#### Daily Workflow

**Every morning:**
- Check the **Overdue** and **Due Today** sidebar filters to see what needs immediate attention
- Mark completed tasks and projects as you finish them

**During the day:**
- Use the **Kanban view** to see your work pipeline at a glance — drag projects across lanes as status changes
- Press `/` to quickly search for a project by name or description
- Use **Focus view** to see your highest-priority in-progress work

**During planning:**
- Switch to **Kanban** or **All Projects** view and sort by **due date** or **priority** to plan your week
- Filter by **Due This Week** to see your commitments
- Tag related projects so you can filter them together (e.g., all sprint tasks, all Q1 goals)

**When projects are done:**
- Mark them as completed
- **Archive** them (Settings → show archived projects) to keep your active list focused
- Your statistics dashboard (`Cmd+I`) updates automatically

#### Keyboard Shortcuts

For faster navigation without reaching for the mouse:

| Shortcut | Action |
|----------|--------|
| `N` | New project |
| `Cmd+K` / `Ctrl+K` | Command palette (search, navigate, change theme) |
| `/` | Focus search bar |
| `Cmd+I` / `Ctrl+I` | Show statistics |
| `Cmd+,` / `Ctrl+,` | Open settings |
| `Esc` | Close modal or dialog |
| `?` | Show all shortcuts |

#### Data Backup and Portability

Your data is yours. Back it up anytime:

1. Go to **Settings → Export Data**
2. Download a full JSON export of all your projects, tasks, and settings
3. Store it in a safe place (external drive, cloud storage, etc.)
4. To restore: go to **Settings → Import Data** and upload the JSON file

This also makes it easy to migrate your workspace to a different machine or share a snapshot with a colleague.

---

### Team Use: Collaboration & Shared Visibility

Project Overviewer supports teams of any size. Each team member creates and manages their own projects, but everyone can see all work when they want to — perfect for stand-ups, planning sessions, and cross-functional visibility.

#### Team Setup (Admin)

As the admin, set up your team once:

**Step 1: Register teammates**
1. Each team member goes to **http://localhost:3001/register** and creates an account
2. You receive a notification of pending users (check Admin Panel at `/admin.html`)
3. Click **Approve** next to each username to allow them to log in
   - Optionally promote a team member to `admin` if needed for management duties

**Step 2: Create a team**
1. Log in and go to **Settings → Team**
2. Click **Create Team** and name it (e.g., "Product Team", "Backend Squad")
3. Click **Add Member** and enter each approved user's username
4. Repeat for each team member you want to include

**Step 3: Notify your team**
Send each member a message saying:
> "You're added to the team! Toggle the Personal / Team button in the top nav bar to switch between your own projects and everyone's."

#### Team Workflow

**For individual contributors:**
- Each person creates their own projects in **Personal mode** — you own them, you're accountable
- Set the **Stakeholder** field to indicate who needs the work (requestor, consumer, etc.)
- Use **Tags** to label by initiative, sprint, or domain (e.g., `Q2-roadmap`, `backend`, `security`)
- When you toggle to **Team mode**, you see all projects from all team members — great for awareness and blockers

**For team leads / managers:**
1. During daily standups or planning, everyone toggles **Team mode**
2. The **Kanban view** shows all work across the team in a single pipeline
3. Filter by:
   - **Status**: see everything blocked, in-progress, or completed
   - **Priority**: focus on high-priority work
   - **Tags**: see a specific initiative (e.g., filter `sprint-12` to see all sprint work)
   - **Stakeholder**: see work owned by specific people
4. The **Statistics dashboard** shows:
   - Total projects across the team
   - Breakdown by status (how much is in progress vs. done)
   - Task completion percentage
   - Distribution across team members

**For visibility and cross-functional work:**
- Marketing can see engineering projects (and their status) to plan launch timelines
- Backend can see frontend blockers and adjust priorities
- Everyone can see upcoming deadlines and spot conflicts early

#### Workspace Toggle: Personal vs. Team

Each user has a **Personal / Team** button in the top navigation bar. This toggle is **per-user and independent**:

| Mode | What You See | Best For |
|------|--------------|----------|
| **Personal** | Only your own projects | Focused individual work, avoiding distractions |
| **Team** | All team members' projects | Stand-ups, planning, dependency identification, cross-functional awareness |

When you change your workspace mode, only *your* view changes — it doesn't affect your teammates.

#### Best Practices for Team Success

1. **Naming**: Use consistent naming so projects are searchable
   - ✅ "Fix widget rendering perf"
   - ❌ "Thing"

2. **Tags**: Create a team tagging convention and stick to it
   - Examples: `Q2-2025`, `backend`, `frontend`, `devops`, `blocked`, `waiting-on-external`
   - Filter by multiple tags to slice views (e.g., all Q2 backend work)

3. **Stakeholders**: Use this field to route visibility
   - "Who cares about this project?" — set them as stakeholder
   - During team view, filter by stakeholder to see your slice of work

4. **Status updates**: Encourage daily or weekly updates during team mode
   - Moving a project from `in-progress` to `completed` is instant feedback to the whole team
   - The **recently updated** sort shows activity at a glance

5. **Project limits**: The admin can set global limits in the Admin Panel
   - Prevents one person from creating 100 half-finished projects
   - Encourages focus and prioritization

#### Admin Responsibilities

During team operation, stay on top of:

1. **User approvals**: Check the Admin Panel (`/admin.html`) weekly for pending registrations
2. **Global settings** (`/admin.html → Global Settings`):
   - Toggle `registrationEnabled` off once your team is fully onboarded (prevents random signups)
   - Set `maxProjectsPerUser` to encourage focus (e.g., 50 per person)
   - Customize `siteName` to show your team or org name
3. **User offboarding**: If someone leaves, delete them from Admin Panel
   - Their projects remain and can be reassigned if needed
4. **Role management**: Promote trusted team members to `admin` if you need help managing users

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
