# Project Overviewer

<div align="center">

**A self-hosted, multi-user project and task management application for individuals and teams.**

No subscriptions. No cloud lock-in. No framework overhead. Just Node.js, SQLite, and pure JavaScript.

![Version](https://img.shields.io/badge/version-1.0-blue)
![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green)
![License](https://img.shields.io/badge/license-MIT-blue)
![Tests](https://img.shields.io/badge/tests-216%20E2E-brightgreen)

[**Get Started in 2 Minutes**](#quick-start) • [**See Features**](#what-you-get) • [**View Docs**](#user-guide) • [**GitHub**](https://github.com/yourusername/project-overviewer)

</div>

---

## Why Project Overviewer?

If you're tired of subscription-based project management tools that:
- 🔒 Lock your data in the cloud
- 💰 Charge per user or per feature
- 🚀 Force you into their workflow
- 📊 Require a PhD to understand

**Project Overviewer** gives you a better way:

| Feature | Overviewer | Traditional SaaS |
|---------|-----------|------------------|
| **Ownership** | Your data, local database | Vendor lock-in |
| **Cost** | Free, forever | $10-30/user/month |
| **Setup time** | 2 minutes | 30+ minutes of config |
| **Customization** | Modify the code freely | Limited API access |
| **Privacy** | Runs on your machine | Cloud storage |
| **Offline support** | Works offline, syncs later | Requires internet |

---

## What You Get

### Core Features

✨ **Effortless Project Management**
- Four statuses (backlog → not-started → in-progress → completed)
- Priority levels with color-coded badges (High 🔴 Medium 🟡 Low 🟢)
- Due dates with smart filters (Overdue, Due Today, Due This Week)
- Full-text search across titles and descriptions
- Tags for flexible organization
- Drag-and-drop reordering
- **Hierarchical tasks** with subtask support

🎯 **Kanban Board with WIP Limits** *(New)*
- Visual pipeline with four drag-and-drop lanes
- **Work in Progress (WIP) limits** per lane with soft enforcement
- **Swimlanes by priority** for team visibility
- Cycle time tracking (days in status)
- Card aging indicators for stalled work
- Blocked task badges to flag dependencies
- Throughput counter (completed this week)

📋 **Rich Task Management**
- Hierarchical tasks (subtasks support)
- Task priority, due dates, and progress tracking
- Task blocking / dependency management
- Flatten all tasks into a focus list view

📎 **Document Attachments**
- Email documents with rich metadata
- `.docx` file uploads and downloads
- Per-project document library

🔗 **Webhooks & Real-Time Collaboration** *(New)*
- Outgoing webhooks for external integrations (events: created, updated, deleted)
- Real-time updates via WebSocket (multiplayer editing, live project sync)
- Event-driven architecture with pub/sub messaging

⚙️ **Personalization**
- Five themes (Light, Dark, Ocean, Forest, Auto)
- Per-user settings (theme, default view, sort order)
- Quick Notes scratch pad
- Statistics dashboard
- Keyboard shortcuts (Cmd+K command palette)

🔐 **Multi-User & Teams** *(with Enterprise-Grade Security)*
- Admin approval workflow for registration
- Role-based access control (admin, user)
- Team creation with independent workspace toggle
- Per-user Personal/Team mode
- Session-based auth (24-hour expiry, Bearer tokens + HttpOnly cookies)
- Bcrypt password hashing, rate limiting, CSRF protection

💾 **Data Portability**
- Export everything as JSON anytime
- Import from JSON backups
- Three built-in project templates (Bug Report, Feature Request, Meeting Notes)
- Migrate between machines without friction

---

## Quick Start

### Prerequisites
- **Node.js** v18+ ([download](https://nodejs.org/))
- That's it — SQLite is bundled

### Install & Run

```bash
# Clone the repository
git clone https://github.com/yourusername/project-overviewer.git
cd project-overviewer

# Install dependencies
npm install

# Configure admin credentials
cp .env.example .env
# Edit .env and set ADMIN_USER and ADMIN_PASS

# Start the server
npm start
# or: ./start.sh (Mac/Linux) or start.bat (Windows)
```

Open **http://localhost:3001** and log in with your admin credentials.

**That's it.** Your database (`projects.db`) is created automatically.

---

## Feature Highlights

### For Solo Users: Personal Task Management

**Your personalized workspace** — no distractions, just your work.

- ✅ Create projects with full metadata (status, priority, due date, description)
- 📊 Kanban board to visualize your work pipeline
- 🔍 Smart filters (Overdue, Due Today, Due This Week)
- 🏷️ Tag and organize projects freely
- ⌨️ Keyboard shortcuts for speed (press `?` to see all)
- 📱 Responsive design works on desktop and mobile

**Daily workflow:** Morning standup on your Kanban board → drag projects as status changes → mark complete → statistics update automatically.

### For Teams: Shared Visibility & Collaboration

**One workspace. Everyone's work visible.** No friction.

- 👥 Create a team, add teammates by username
- 🔄 **Workspace toggle**: each user switches independently between Personal (focused work) and Team (all projects visible)
- 📊 Team statistics: breakdown by status, priority, stakeholder
- 🎯 Filter by priority, status, stakeholder, or tag to focus on your slice
- 🚀 Use swimlanes to see high-priority work flowing across all statuses
- 🏠 **Personal mode** when you need deep focus
- 🤝 **Team mode** for standups, planning, and cross-functional awareness

**Weekly standup:** Toggle to Team mode → enable swimlanes by priority → everyone discusses high-priority work → adjust as needed.

### For Developers: Dead-Simple Architecture

**Minimal tooling. Maximum clarity. 23 JS modules + modular Express routes + SQLite.**

- 📝 **Frontend**: Modular vanilla JavaScript (no React or Vue), bundled by esbuild
- 🔌 **Backend**: `server.js` entry point with 12 route modules in `routes/`
- 💾 **Database**: SQLite with WAL mode (concurrent reads + reliable writes)
- 🔒 **Security**: Helmet, rate limiting, Zod validation, bcrypt hashing
- ✅ **Tests**: 93 Playwright E2E tests (auth, CRUD, RBAC, security)
- 📖 **Documentation**: Fully documented codebase + architecture guide

**Total lines of code:** ~6000 across modular routes and utilities. Still understand it in a day or two.

---

## Installation & Configuration

### Environment Variables

Create a `.env` file (copy from `.env.example`):

```env
# Admin account seeded on first startup
ADMIN_USER=admin
ADMIN_PASS=your-secure-password

# Server
PORT=3001
NODE_ENV=development

# URLs and security
APP_ORIGIN=http://localhost:3001
TRUST_PROXY=false

# Logging
LOG_LEVEL=info
```

#### Production Setup

```env
NODE_ENV=production
APP_ORIGIN=https://your-domain.example
TRUST_PROXY=1  # If behind a reverse proxy
```

**Important:** In production, cookies require HTTPS (`Secure` flag) and rate limiting is fully enforced.

### Building & Development

The frontend is bundled with esbuild for optimization. A build runs automatically before start/test:

```bash
npm run build                               # Build frontend bundles
npm start                                   # Start server (runs build first)
npm run dev                                 # Development mode (same as start)
```

### Running Tests

```bash
npm test                                    # Run all E2E tests (builds first)
npm run test:ui                             # Interactive Playwright UI
npx playwright test --headed                # Watch tests in browser
npx playwright test tests/e2e/auth.spec.js  # Single test file
```

---

## User Guide

### Kanban Board: Mastering Work in Progress

The Kanban view is the heart of Project Overviewer. It visualizes your entire work pipeline in one place.

#### The Four Lanes

| Lane | Purpose | Best For |
|------|---------|----------|
| **Backlog** | Ideas, not yet ready | Parking lot for future work |
| **Not-Started** | Ready but not started | Queue of next work |
| **In-Progress** | Currently being worked | Active focus (keep small!) |
| **Completed** | Finished and shipped | Historical record |

#### WIP (Work In Progress) Limits — The Game Changer

WIP limits are the single most powerful feature for managing bottlenecks:

1. **Open the Kanban view**
2. **In each lane header**, you'll see a `WIP` input field (shows `∞` when unlimited)
3. **Enter a number** — e.g., set `in-progress: 3` to limit active work
4. **Visual feedback:**
   - 🟡 Yellow: at the limit (warning)
   - 🔴 Red: exceeded the limit (violation)

**Why WIP limits matter:**
- Forces you to finish work before starting new work
- Prevents context-switching (mental tax is huge)
- Shows bottlenecks immediately (red lanes = blocked work)
- Improves throughput and team focus

**Best practice:** Try `in-progress: 2-5`, `not-started: 5-10`, others unlimited.

#### Swimlanes by Priority

For teams or complex workflows, toggle **Swimlanes** to transform the Kanban view into a matrix — giving you instant visibility into high-priority work flow.

**How to activate:**
1. In the Kanban view, look for the **⊞ Swimlanes** toggle in the toolbar (top-right of the board)
2. Click the toggle to switch between:
   - **⊞ Off** — Standard lane view (one horizontal lane per status)
   - **⊞ On** — Matrix view (priority + status grid)

**What you see with Swimlanes ON:**
- **Columns** = status lanes from left to right (Backlog → Not-Started → In-Progress → Completed)
- **Rows** = priority levels from top to bottom (High → Medium → Low → None)
- **Cards** appear in their priority row + status column intersection
- **Example**: A high-priority, in-progress project appears in the top-right quadrant

This creates a powerful **priority matrix** that instantly shows:
- High-priority work stuck in Backlog (needs attention!)
- How many high-priority items are In-Progress (vs. low-priority tasks)
- When low-priority work is blocking high-priority (visible misalignment)

**Use swimlanes when:**
- 🤝 **Team standups** — Everyone sees high-priority work across all statuses at a glance
- 🚨 **Priority conflicts** — Spot low-priority work blocking high-priority items immediately
- 📊 **Capacity planning** — "Are we overloaded with medium/low-priority tasks?"
- 🚀 **Release planning** — Track how fast high-priority items flow to Completed
- 👥 **Team visibility** — In Team mode + swimlanes = complete work priority picture

**Swimlanes vs. Standard view:**

| Aspect | Standard Lanes | Swimlanes Matrix |
|--------|---|---|
| **Layout** | 4 horizontal lanes (one per status) | 4×4 grid (status × priority) |
| **Best for** | Individual focus, simple workflows | Teams, priority-driven workflows |
| **Visual** | Compact, minimal scrolling | Spacious, clear separation by priority |
| **Drag-drop** | Move between status lanes | Move within same priority row or between lanes |

**Pro tip:** Toggle swimlanes OFF for deep focus work, ON for team planning sessions.

#### Card Visual Cues

Each compact card shows critical information at a glance:

- 🎨 **Colored dot** (left) — priority indicator
- ✓ **Task progress** — completed/total tasks
- 📅 **Due date** — red if overdue
- ⛔ **Blocked badge** — has blocked tasks
- **7d** — cycle time (days in current status; >14d = stale)
- 👤 **Avatar** — project owner (in Team mode)

#### Kanban Best Practices

1. **Keep In-Progress small** — set a WIP limit and respect it
2. **Unblock first** — if you see ⛔ badge, investigate immediately
3. **Move projects daily** — every standup, reflect real status
4. **Respect cycle time** — >14 days in one lane = investigate blocker
5. **Review throughput** — check Completed lane footer: "X finished this week"
6. **Use swimlanes for visibility** — team mode + swimlanes by priority

### Settings & Options

Open settings with `Cmd+,` (Mac) or `Ctrl+,` (Windows/Linux).

#### Display & Appearance

| Setting | Options | When to Use |
|---------|---------|-------------|
| **Theme** | Light, Dark, Ocean, Forest, Auto | Dark for low-light, Light for bright rooms, Auto follows OS |
| **Sidebar Collapsed** | On/Off | Small screen or full-screen kanban focus |

#### Sorting & Views

| Setting | When to Use |
|---------|-------------|
| **Default Sort** | Manual (you control), Due Date (urgency), Priority (importance), Recently Updated (activity) |
| **Default View** | All Projects (search/filter heavy), Kanban (visual workflow), Focus (single-threaded work) |

#### Kanban Configuration

| Setting | When to Use |
|---------|-------------|
| **WIP Limits** (per lane) | Always set `in-progress` (e.g., 3); optional for others |
| **Swimlane By** | Turn on for team standups; turn off for simpler view |

#### Data Portability

- **Export Data** — weekly/monthly backup; migration; sharing snapshots
- **Import Data** — restore from backup; test scenarios without losing current data

#### Team Settings

- **Workspace Mode** — Personal (focused) vs Team (shared visibility)
- **Create Team / Add Members** — team setup; onboarding

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `N` | New project |
| `Cmd+K` / `Ctrl+K` | Command palette (search, navigate, theme) |
| `/` | Focus search |
| `Cmd+I` / `Ctrl+I` | Statistics |
| `Cmd+,` / `Ctrl+,` | Settings |
| `?` | Show all shortcuts |
| `Esc` | Close modal |

---

## Team Collaboration

### One-Time Setup (Admin)

**Step 1: Register teammates**
- Each person visits `/register` and creates an account
- You approve them in Admin Panel (`/admin.html`)
- Optionally promote trusted people to admin

**Step 2: Create a team**
- Settings → Team → **Create Team**
- Add each member by username

**Step 3: Done**
- Tell your team: "Toggle Personal / Team in the top nav bar"

### Solo to Team Transition

**Starting solo? You can upgrade to a team at any time.** There's no separate account type — any solo user can instantly become a team account:

1. **Create a team** — Settings → Team → enter a team name → click "Create Team"
2. **Invite teammates** — Click "Add Member" and enter usernames (they must be registered and admin-approved)
3. **Start collaborating** — Toggle Team mode and see all team members' projects
4. **Existing projects carry over** — Your solo work stays in the same place; teammates just gain visibility

**Key points:**
- No data migration needed — your projects don't move
- You stay in Personal mode for focused work; toggle to Team mode for standups
- You can only belong to one team (leave/delete the current team to create a new one)
- Team owner is the person who created the team (can delete or add/remove members)

### Workspace Toggle: Personal vs. Team

Each user controls their own view independently:

| Mode | Sees | Best For |
|------|------|----------|
| **Personal** | Only their projects | Focused individual work |
| **Team** | All team members' projects | Standups, planning, cross-team visibility |

### Team Best Practices

1. **Consistent naming** — "Fix widget rendering perf" not "Thing"
2. **Team tagging convention** — e.g., `Q2-2025`, `backend`, `blocked`
3. **Use Stakeholder field** — route visibility to who needs to know
4. **Daily status updates** — move projects between lanes; shows activity
5. **Review statistics** — breakdown by status, owner, priority

### Admin Responsibilities

- ✅ Approve/reject pending user registrations (weekly check)
- ✅ Configure global settings (registration on/off, project limits, site name)
- ✅ Manage user offboarding (delete user; projects stay)
- ✅ Promote power users to admin if needed

---

## Advanced Features

### Project Archiving

**Keep your active list clean by archiving completed projects.**

1. Open any project → click **Archive** button
2. Archived projects appear in a separate **Archived** tab (All Projects view)
3. Archived projects are **read-only** — tasks and documents cannot be modified
4. Unarchive anytime to bring a project back to active status

**When to use:**
- End-of-quarter cleanup
- Completed initiatives you want to preserve for reference
- Reducing Kanban board noise (they don't appear on the Kanban)

### Focus View: Prioritized Task List

**One distraction-free view of all your incomplete work, organized by urgency.**

Access via:
- Statistics icon (`Cmd+I`)
- Command Palette (`Cmd+K` → "Focus Mode")

**What you see:**
- **Overdue** — Tasks past their due date (red)
- **Today** — Tasks due today (urgent)
- **Next 7 Days** — Tasks due this week
- **High Priority (No Date)** — Critical work without deadlines

Click any task to open it. Great for morning standups or single-threaded work sessions.

### Task Blocking & Dependencies

**Track task sequences, prevent duplicate work, and visualize impediments.**

**How to create a dependency:**

1. Open a task in the modal
2. Find the **"Blocked By"** field
3. Click the input → search for the blocking task (from any project)
4. Confirm the selection

**What you'll see:**
- **Cards show ⛔ badge** when a project contains blocked tasks
- **"Unblocks" section** shows what this task unblocks (transitive dependencies)
- **Task ID** shown for reference in logs or discussion

**Example use case:**
- Task A (backend API) blocks Task B (frontend integration)
- Task B's card shows ⛔ badge
- You know not to start Task B until Task A is done

### Subtasks: Hierarchical Task Structure

**Break down complex tasks into one level of subtasks.**

**Creating subtasks:**

1. Open a project modal
2. In the task list, click **+ Add Subtask** below a parent task
3. Enter subtask title and press Enter
4. Subtasks inherit parent's due date but can override priority

**What you get:**
- **Progress indicator** on parent: "3/5 completed"
- **All task properties**: priority, due date, blocking, notes
- **Nested drag-and-drop** in Kanban (drag subtask to change status)
- **Cannot nest deeper** than 1 level (prevents complexity)

**When to use:**
- Refactor task: split into smaller steps
- QA sign-off: break into test cases
- Sprint planning: decompose larger stories

### Cycle Time Tracking: Spot Bottlenecks

**Every Kanban card shows how long it's been in the current status.**

**What the numbers mean:**
- **"7d"** — 7 days in current status
- **"🕐 stale"** — >14 days in one status (usually a blocker)

**How to interpret:**
- High cycle time = bottleneck. Ask: "Why hasn't this moved?"
- Stale cards on Kanban = investigate blocked work
- Compare across statuses: "Not-Started lane has high averages" = capacity issue

**Best practice:** During daily standups, look for stale cards and unblock them.

### Quick Notes: Scratch Pad

**A personal, persistent scratch space — think notepad, not project notes.**

Access via:
- Command Palette (`Cmd+K` → "Quick Notes")
- Keyboard shortcut `Cmd+Shift+N`

**Use for:**
- Daily standup talking points
- Brain dumps before organizing into projects
- Meeting notes (separate from project-tied documents)
- Personal reminders

Notes are **per-user** and persisted to the database (never lost on refresh).

### Undo & Recovery: Safe Deletions

**Deleted projects can be recovered — safety net for teams.**

**How it works:**
- Delete a project → it enters a soft-delete state (not permanently gone)
- Project is hidden from views but data remains in database
- Project can be restored (undeleted) within a recovery window

**Useful for:**
- Accidental deletes by team members
- "Oops, I shouldn't have archived that" moments
- Bulk delete recovery via undo endpoint

### Data Export & Import: Full Data Portability

**Back up everything. Migrate between machines. Test scenarios.**

**Export:**
1. Settings → Data Portability → **Export Data**
2. Downloads all your projects, tasks, subtasks, documents, tags as JSON
3. Human-readable; safe to store

**Import:**
1. Settings → Data Portability → **Import Data**
2. Select JSON file (from backup or another user)
3. All relationships preserved: subtask hierarchy, blocking, documents, tags

**Use cases:**
- Weekly backups (run on Monday)
- Migrating to a new server
- Testing workflow changes without affecting live data
- Sharing a project template with the team

**Rate limit:** 5 imports per hour per user (prevents abuse)

### Global Settings (Admin Only)

**Configure org-wide rules and limits.**

Access: Admin Panel → **Global Settings**

| Setting | Purpose | Example |
|---------|---------|---------|
| **maxProjectsPerUser** | Enforce project quota per user | `50` = max 50 projects per user |
| **maxTasksPerProject** | Prevent runaway task lists | `200` = max 200 tasks per project |
| **siteName** | Customize app title | `"Acme Corp Projects"` |
| **registrationEnabled** | Open/close new registrations | `false` = admin-only, no self-signup |
| **maintenanceMode** | Graceful shutdown (no new requests) | `true` = app returns 503, exit gracefully |

**Best practice:** Set `maxProjectsPerUser` and `maxTasksPerProject` to prevent database bloat.

### Theme Switching: Keyboard Power User Workflow

**Change themes without touching Settings.**

Press `Cmd+K` (Command Palette) and type:
- `light`, `dark`, `ocean`, `forest`, or `auto`
- Select and press Enter

**Themes:**
- **Light** — Bright rooms, bright screens
- **Dark** — Low-light environments, reduced eye strain
- **Ocean** — Cool blues, calming
- **Forest** — Warm greens, nature-inspired
- **Auto** — Match your OS preference (system dark mode)

All themes preserve full readability and WCAG AA contrast.

### Webhooks: External Integrations

**Notify external systems when projects and tasks change.**

**Setting up:**
1. Settings → Team → **Webhooks**
2. Enter webhook URL (e.g., `https://your-api.example.com/projects`)
3. Select events to trigger: `project.created`, `project.updated`, `project.deleted`, `task.*`
4. Save

**What happens:**
- When a project updates, an HTTP POST is sent to your URL with event data
- Payload includes full project/task details in JSON
- Automatic retries on failure (exponential backoff)

**Use cases:**
- Slack notifications: post to channel when high-priority project created
- Analytics pipeline: log every change for insights
- CI/CD integration: trigger builds when project status changes
- Sync to external tools: Jira, Linear, Asana integration
- Audit logging: centralized record of all changes

**Security:** Each webhook has a secret token for HMAC signature verification.

### Real-Time Sync: Live Multiplayer Editing

**See teammates' changes instantly. No manual refresh.**

**How it works:**
- When a teammate updates a project, your browser receives live WebSocket notification
- Project cards update automatically on Kanban board
- No stale data; always in sync with latest state

**Experience:**
- Colleague moves card to "Completed" → your board updates immediately
- Teammate adds a task → appears in modal without reload
- Multiple people editing same project → no conflicts (event-driven sync)

**When it matters:**
- Live standup: watch the board update as people report progress
- Remote collaboration: real-time visibility without back-and-forth
- Distributed teams: async standups where you watch live updates

---

## Architecture

### Design Philosophy

Project Overviewer is **intentionally simple**. It prioritizes:
- **Readability** — understand the entire codebase in an afternoon
- **Reliability** — no external dependencies; no framework magic
- **Ownership** — your data stays on your machine
- **Modifiability** — change the code without fighting build pipelines

### Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | Vanilla JavaScript (23 modules, esbuild) | No framework overhead; explicit dependency graph; bundled for optimization |
| **Backend** | Express.js (modular routes) | Clean separation by domain (auth, projects, tasks, etc.); easy to extend |
| **Database** | SQLite with WAL mode | Reliable, concurrent, zero setup |
| **Auth** | Session tokens (Bearer + HttpOnly) | Stateful; simple; compatible with browsers; security event logging |
| **Real-time** | WebSocket + event bus | Multiplayer editing, live project sync |
| **Webhooks** | Outgoing event dispatch | External integrations, automation |
| **Validation** | Zod | Runtime type safety on all inputs |
| **Security** | Helmet, rate limiting, bcrypt, password policy | Defense-in-depth at every layer |

### System Architecture

```
┌─────────────────────────────────┐
│     Browser (index.html)         │
│   esbuild bundles + CSS          │
└────────────────┬────────────────┘
                 │ HTTP (REST)
┌────────────────▼────────────────┐
│   server.js (Express)            │
│   Helmet → Rate Limit → Auth     │
│   → Zod Validation → Routes      │
└────────────────┬────────────────┘
                 │ async/await
┌────────────────▼────────────────┐
│   database.js (@libsql/client)   │
│   waitForDb() → Schema → CRUD    │
└────────────────┬────────────────┘
                 │ WAL mode
┌────────────────▼────────────────┐
│   projects.db (SQLite file)      │
└─────────────────────────────────┘
```

### Frontend: 23 Modular JS Files

Source modules in `public/js/` are bundled by esbuild into 3 content-hashed bundles in `public/dist/`:

1. **boot.js** — entry-point router (page detection, bundle loading)
2. **index-guard.js** — auth guard for protected pages
3. **api-client.js** — fetch wrapper with auth headers
4. **utils.js** — date formatting, DOM helpers
5. **state.js** — central state management
6. **toast.js** — notifications
7. **theme.js** — CSS variable swapping (5 themes)
8. **filters.js** — search, filter, sort logic
9. **render.js** — DOM construction
10. **projects.js** — project CRUD
11. **tasks.js** — task CRUD
12. **modals.js** — modal lifecycle
13. **commands.js** — command palette (Cmd+K)
14. **dragdrop.js** — kanban drag-and-drop
15. **keyboard.js** — keyboard shortcuts
16. **events.js** — event delegation
17. **team.js** — team management
18. **ws-client.js** — WebSocket real-time sync
19. **polling.js** — long-polling fallback
20. **app.js** — bootstrap
21. **login-page.js** — login page
22. **register-page.js** — registration page
23. **admin-page.js** — admin panel

### Backend: Modular Route Structure

**server.js** orchestrates the application:
- Middleware stack (Helmet, rate limiting, auth, Zod validation)
- Express app initialization and route registration
- WebSocket server setup
- Webhook dispatcher initialization

**Routes** (separated by domain):
- `routes/auth.js` — authentication and session management
- `routes/admin.js` — admin panel, user management, global settings
- `routes/projects.js` — project CRUD and reordering
- `routes/tasks.js` — task CRUD, subtasks, dependencies
- `routes/teams.js` — team creation, membership, workspace mode
- `routes/documents.js` — document attachments, downloads
- `routes/settings.js` — per-user settings (theme, view, sort)
- `routes/export-import.js` — data portability
- `routes/notes.js` — quick notes (scratch pad)
- `routes/templates.js` — project templates
- `routes/webhooks.js` — webhook management and delivery

**Utilities:**
- `database.js` — SQLite abstraction with `waitForDb()` pattern
- `logger.js` — Pino structured logging
- `password-policy.js` — password validation rules
- `security-events.js` — security event logging and token fingerprinting
- `session-config.js` — session timeout configuration
- `event-bus.js` — pub/sub for real-time updates
- `webhook-dispatcher.js` — event-driven webhook delivery
- `app-constants.js` — allowlisted settings, webhook events

**Why modular routes?** Easier to navigate, extend, and test. Each domain is self-contained.

### Database: 10 Tables, User-Scoped Queries

**Schema** (10 tables across 4 groups):
- **Auth**: users, sessions
- **Content**: projects, tasks, documents
- **Collaboration**: teams, team_members
- **Configuration**: global_settings, user_settings, quick_notes, templates

**Key patterns:**
- UUID primary keys everywhere (security + portability)
- Every read query includes `user_id` filter (or expands to team members)
- JSON columns for `tags`, `tasks` (template), `payload` (email) — schema-migration-free
- SQLite with WAL mode (concurrent reads + reliable writes)

### Security

| Layer | Control |
|-------|---------|
| **Transport** | HSTS in production; Secure cookie flag requires HTTPS |
| **Headers** | Helmet: CSP, X-Frame-Options, X-Content-Type-Options |
| **Rate Limiting** | 200 req/15 min general; 20/15 auth; 5/hr import |
| **Passwords** | bcrypt with 12 salt rounds |
| **Sessions** | 32-byte token; 24-hour expiry; invalidated on password change |
| **Authorization** | Every endpoint verifies user ownership or team membership |
| **Input** | Zod schemas on all inputs; allowlisted settings keys |
| **Files** | MIME type allowlisting; filename sanitization |

---

## API Reference

All endpoints require authentication (Bearer token or HttpOnly cookie) except `/api/health`.

### Authentication

```
POST /api/auth/register    Register new user (pending approval)
POST /api/auth/login       Login (returns token + cookie)
POST /api/auth/logout      Logout
GET  /api/auth/me          Current user info
PUT  /api/auth/password    Change password
```

### Projects

```
GET  /api/projects                Get all projects (team-aware)
POST /api/projects                Create project
PUT  /api/projects/:id            Update project
DELETE /api/projects/:id          Delete project
POST /api/projects/reorder        Reorder projects
```

### Tasks

```
POST /api/projects/:projectId/tasks           Create task
PUT  /api/tasks/:id                            Update task
DELETE /api/tasks/:id                          Delete task
POST /api/projects/:projectId/tasks/reorder    Reorder tasks
```

### Teams (requires auth)

```
POST /api/teams                           Create team
GET  /api/teams/mine                      Get current user's team
POST /api/teams/:id/members               Add member (owner/admin only)
DELETE /api/teams/:id/members/:userId     Remove member
DELETE /api/teams/:id                     Delete team (owner/admin only)
```

### Settings

```
GET /api/settings                  Get all user settings
POST /api/settings/:key            Set user setting
```

### Admin

```
GET /api/admin/users                    List all users (admin only)
PUT /api/admin/users/:id/approve        Approve user registration
PUT /api/admin/users/:id/role           Change user role
DELETE /api/admin/users/:id             Delete user
```

### Documents

```
GET /api/projects/:projectId/documents        List documents for project
POST /api/projects/:projectId/documents       Create document (email or docx)
DELETE /api/documents/:id                     Delete document
GET /api/documents/:id/download               Download document file
```

### Webhooks

```
GET /api/webhooks                             List all webhooks (auth required)
POST /api/webhooks                            Create webhook (auth required)
PUT /api/webhooks/:id                         Update webhook
DELETE /api/webhooks/:id                      Delete webhook

Events: project.created, project.updated, project.deleted, task.created, task.updated, task.deleted
```

### Health

```
GET /api/health                          Database health check (no auth required)
```

---

## Troubleshooting

### App Won't Start

```bash
# Check Node.js version
node --version  # should be v18+

# Reinstall dependencies
rm -rf node_modules && npm install

# Check if port is in use
lsof -i :3001  # if in use, change PORT in .env
```

### Can't Log In

- ✅ Confirm `ADMIN_USER` and `ADMIN_PASS` are set in `.env`
- ✅ Check that user is approved (Admin Panel → Users)
- ✅ New users require admin approval before first login
- ✅ If you changed the password, session tokens are invalidated — log in again

### Database Issues

```bash
# Reset database completely
rm projects.db
# Restart server — schema recreates automatically

# Inspect database directly
sqlite3 projects.db
sqlite> .tables
sqlite> SELECT id, username, role FROM users;
sqlite> .quit
```

**Note:** WAL mode creates `-wal` and `-shm` files — these are normal and safe.

### Projects Not Showing in Team View

- ✅ Check workspace toggle (top nav bar) is set to **Team**
- ✅ Confirm all team members are added (Settings → Team → Add Member)
- ✅ Verify members are approved in Admin Panel

---

## Contributing

We welcome contributions! Here's how:

1. **Fork** the repository
2. **Create a feature branch** (`git checkout -b feature/your-feature`)
3. **Write tests** (Playwright E2E tests in `tests/e2e/`)
4. **Keep it simple** — no frameworks, no complex abstractions
5. **Test it locally** (`npm test`)
6. **Submit a pull request**

### Code Guidelines

- **Frontend:** Vanilla JavaScript, esbuild bundles, explicit globals
- **Backend:** `server.js` entry point with modular route files in `routes/`
- **Database:** User-scoped queries, cascade deletes, UUIDs for IDs
- **Security:** Validate all inputs (Zod), hash passwords, rate-limit endpoints
- **Tests:** E2E tests only (Playwright); test auth, CRUD, RBAC, security

---

## Support & Community

- 🐛 **Report bugs** — [Open a GitHub issue](https://github.com/yourusername/project-overviewer/issues)
- 💬 **Ask questions** — [GitHub Discussions](https://github.com/yourusername/project-overviewer/discussions)
- 📚 **Read docs** — [Full documentation](./docs/)
- 🚀 **See examples** — [Example projects](./examples/)

---

## Roadmap

- [x] Real-time collaboration (WebSocket + event bus)
- [x] Webhooks for external integrations
- [x] Hierarchical tasks (subtasks)
- [x] Project templates
- [ ] Recurring projects and tasks
- [ ] Custom fields per project
- [ ] Mobile app (React Native)
- [ ] Advanced automation (IFTTT-style rules)
- [ ] Bulk import/export tools
- [ ] Team roles and permissions (beyond owner/member)

---

## License

MIT — use freely, modify freely, deploy freely.

---

<div align="center">

**[Get Started](#quick-start)** • **[Features](#what-you-get)** • **[Docs](#user-guide)** • **[Issues](https://github.com/yourusername/project-overviewer/issues)** • **[License](#license)**

Built with ❤️ for people who want to own their tools.

</div>
