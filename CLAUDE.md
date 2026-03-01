# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Project Overviewer is a full-stack project and task management application with a SQLite database backend. The application uses a client-server architecture with Express.js serving a single-page application (SPA) built with vanilla JavaScript.

**Technology Stack:**
- **Backend**: Node.js with Express.js
- **Database**: SQLite3 with promise-based wrappers
- **Frontend**: Vanilla JavaScript (no framework)
- **API**: REST API with JSON responses

**Key Features:**
- Project and task management with status tracking (backlog, not-started, in-progress, completed)
- Kanban board with drag-and-drop and configurable WIP limits per lane
- Stakeholder assignment and filtering
- Priority levels (high, medium, low, none) with color-coded indicators
- Tag-based organization and filtering
- Due date tracking with overdue/today/this week smart filters
- Quick inline editing with undo functionality
- Multiple sorting options (manual, due date, priority, title, stakeholder, recently updated)
- Command palette for quick navigation (⌘K / Ctrl+K)
- Theme system with CSS custom properties (Light, Dark, Ocean, Forest, Auto)
- Statistics dashboard
- Quick notes (scratch pad)
- Export/import functionality for data backup
- Project templates (Bug Report, Feature Request, Meeting Notes)

## Architecture

### Three-Tier Structure

The application follows a classic three-tier architecture:

1. **Presentation Layer** (`index.html`)
   - Single-page application with inline JavaScript
   - Manages all UI interactions, state, and rendering
   - Communicates with backend via API client

2. **API Layer** (`server.js` + `api-client.js`)
   - Express.js REST API handles all HTTP endpoints
   - Client-side `API` class wraps fetch calls
   - All endpoints prefixed with `/api/`

3. **Data Layer** (`database.js`)
   - SQLite3 database abstraction
   - Promise-based query wrappers (`run`, `get`, `all`)
   - Database initialization and schema migrations
   - Five main tables: `projects`, `tasks`, `settings`, `quick_notes`, `templates`

### Key Design Patterns

**Database Access Pattern:**
- All database functions are async and await `waitForDb()` before executing
- This ensures the database schema is initialized before any queries run
- UUID-based IDs for projects and tasks (generated via `generateId()`)

**API Response Pattern:**
- Success: Returns JSON data with appropriate HTTP status codes
- Error: Returns `{ error: "message" }` with 4xx/5xx status codes
- All endpoints follow RESTful conventions

**Frontend State Management:**
- No framework; state managed in JavaScript closures
- DOM manipulation via vanilla JavaScript
- Auto-save every 2 seconds to backend

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

### Installing Dependencies

```bash
npm install
```

Required dependencies:
- `express` - Web server framework
- `sqlite3` - Database driver
- `cors` - Cross-origin resource sharing middleware

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
sqlite> .schema projects
sqlite> SELECT * FROM projects;
sqlite> .quit
```

## Code Structure

### Backend Files

**`server.js`** - Express application and route handlers
- Project CRUD endpoints: `/api/projects`, `/api/projects/:id`
- Task endpoints: `/api/projects/:projectId/tasks`, `/api/tasks/:id`
- Settings endpoints: `/api/settings`, `/api/settings/:key`
- Export/import: `/api/export`, `/api/import`
- Quick notes: `/api/notes`
- Templates: `/api/templates`
- Static file serving and graceful shutdown handlers

**`database.js`** - Database abstraction layer
- Connection management with `waitForDb()` pattern
- Schema initialization with migrations (e.g., adding `stakeholder` column)
- Promise wrappers: `run()`, `get()`, `all()`
- CRUD operations for all entities
- Export/import functionality
- Foreign key constraints enabled (`PRAGMA foreign_keys = ON`)
- Cascade deletion (deleting a project removes its tasks)

**`api-client.js`** - Frontend API wrapper
- Centralizes all fetch calls
- Error handling and JSON parsing
- Exported as global `window.API` object

### Frontend Files

**`index.html`** - Single-page application
- Inline CSS with CSS custom properties for theming
- Inline JavaScript with full application logic
- Four themes: Light, Dark, Ocean, Forest
- Features: Kanban board, project cards, task management, search, filters, statistics, settings

### Startup Scripts

**`start.sh`** - Mac/Linux startup script
- Checks for Node.js installation
- Installs dependencies if `node_modules` missing
- Starts the server

**`start.bat`** - Windows startup script
- Same functionality as `start.sh` for Windows

## Database Schema

### projects table
```sql
id TEXT PRIMARY KEY              -- UUID
title TEXT NOT NULL
stakeholder TEXT                 -- Added via migration
description TEXT
status TEXT DEFAULT 'not-started'  -- backlog, not-started, in-progress, completed
priority TEXT DEFAULT 'medium'     -- high, medium, low, none
due_date TEXT                      -- ISO 8601 date string
tags TEXT                          -- JSON array string
project_order INTEGER DEFAULT 0    -- For manual sorting
created_at TEXT
updated_at TEXT
```

### tasks table
```sql
id TEXT PRIMARY KEY
project_id TEXT NOT NULL          -- Foreign key to projects(id)
title TEXT NOT NULL
completed INTEGER DEFAULT 0       -- Boolean: 0 or 1
due_date TEXT
notes TEXT
priority TEXT DEFAULT 'none'
recurring TEXT                    -- For future recurring tasks feature
task_order INTEGER DEFAULT 0      -- For manual sorting
created_at TEXT
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
```

**Important:** The schema was migrated to remove a UNIQUE constraint on `project_id` that previously prevented multiple tasks per project. This migration runs automatically on startup if needed.

### settings table
```sql
key TEXT PRIMARY KEY
value TEXT                        -- JSON-encoded value
```

### quick_notes table
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
content TEXT
created_at TEXT
updated_at TEXT
```

### templates table
```sql
id TEXT PRIMARY KEY
name TEXT NOT NULL
tasks TEXT NOT NULL               -- JSON array of task titles
```

## API Endpoints

### Projects
- `GET /api/projects` - Get all projects with tasks
- `GET /api/projects/:id` - Get single project with tasks
- `POST /api/projects` - Create project
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project (cascades to tasks)
- `POST /api/projects/reorder` - Update project order (bulk)

### Tasks
- `GET /api/projects/:projectId/tasks` - Get tasks for project
- `POST /api/projects/:projectId/tasks` - Create task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task

### Settings
- `GET /api/settings` - Get all settings
- `GET /api/settings/:key` - Get single setting value
- `POST /api/settings/:key` - Set setting value

### Other
- `GET /api/notes` - Get quick notes content
- `POST /api/notes` - Save quick notes
- `GET /api/templates` - Get all templates
- `GET /api/export` - Export all data as JSON
- `POST /api/import` - Import data from JSON

## Common Development Tasks

### Adding a New API Endpoint

1. Add route handler in `server.js`
2. Add database function in `database.js` (if needed)
3. Add API client method in `api-client.js`
4. Update frontend code in `index.html` to call new endpoint

### Adding a Database Column

1. Add column in `initDatabase()` in `database.js`
2. Write migration logic to add column to existing databases
3. Update relevant CRUD functions to handle new field
4. Update API endpoints to accept/return new field
5. Update frontend to display/edit new field

### Testing the API

Use the included verification script:
```bash
./verify-api.sh
```

Or test manually with curl:
```bash
# Get all projects
curl http://localhost:3001/api/projects

# Create a project
curl -X POST http://localhost:3001/api/projects \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Project","status":"not-started"}'

# Update a project
curl -X PUT http://localhost:3001/api/projects/{id} \
  -H "Content-Type: application/json" \
  -d '{"status":"in-progress"}'

# Delete a project
curl -X DELETE http://localhost:3001/api/projects/{id}
```

### Debugging

**Server-side errors:**
- Check terminal output where `node server.js` is running
- All errors logged to console with `console.error()`

**Database issues:**
- Delete `projects.db` and restart to recreate schema
- Use `sqlite3 projects.db` to inspect data directly
- Check for foreign key violations or constraint errors

**Frontend issues:**
- Open browser DevTools (F12)
- Check Console tab for JavaScript errors
- Check Network tab for failed API calls
- All API errors logged via `console.error()` in `api-client.js`

## Important Notes

### Database Initialization
- The database uses a `waitForDb()` pattern to ensure schema is created before any queries
- Server startup waits for database initialization before listening on port
- Default templates are seeded on first run

### Data Persistence
- All data stored in SQLite database (`projects.db`)
- No in-memory storage or mock data
- Export/import features use full database snapshots

### Frontend Architecture
- Single HTML file with inline JavaScript (no build step)
- Global `API` object available for all fetch calls
- No state management library; state managed in closures

### Graceful Shutdown
- Server handles `SIGINT` (Ctrl+C) and `SIGTERM`
- Database connection closed cleanly on shutdown
- Safe to stop server without data loss

### Port Configuration
- Default port: 3001
- Override with environment variable: `PORT=4000 npm start`