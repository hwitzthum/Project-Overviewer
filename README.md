# Project Overviewer - User Guide

Welcome to Project Overviewer! This is a powerful project and task management app with a database backend for reliable data storage.

---

## 🧠 Options Overview

Project Overviewer exposes every option you need:

- **Themes**: Light, Dark, Ocean, Forest, or Auto (matches your system preference).
- **Views**: All Projects, Kanban Board, status filters (`not-started`, `in-progress`, `backlog`, `completed`), priority filters, overdue/today/this week, tag filters, and stakeholder groups.
- **Status choices**: `backlog`, `not-started`, `in-progress`, `completed`.
- **Priorities** (only available once status is not `backlog`): High, Medium, Low, None.
- **Due date**: Optional calendar picker; overdue items highlight in red.
- **Stakeholder field**: Enter the requester’s name, filter/group via the sidebar, or edit inline.
- **Kanban board**: Four color-coded lanes with drag-and-drop plus editable WIP limits per lane—leave blank for unlimited or enter a number to cap cards.
- **Quick inline edits**: Change status, priority, and stakeholder directly on each card with undo toasts.
- **Sorting options**: Manual, Due Date, Priority, Title, Stakeholder, or Recently Updated.

Knowing these options up front makes it easier to pick the right view and controls while you follow the rest of this guide.

---

## 🚀 How to Setup and Run the App

### Prerequisites

You need **Node.js** installed on your computer. If you don't have it:
1. Visit https://nodejs.org/
2. Download the LTS (Long Term Support) version
3. Install it following the installer instructions

### Step 1: Open Terminal/Command Prompt

**On Mac:**
1. Press `⌘ + Space` to open Spotlight
2. Type "Terminal" and press Enter

**On Windows:**
1. Press `Windows + R`
2. Type "cmd" and press Enter

### Step 2: Navigate to the Project Folder

In the terminal, type:
```bash
cd /Users/hwitzthum/Project-Overviewer
```
(Replace the path wi/enth wherever you saved the Project-Overviewer folder)

### Step 3: Start the App

**On Mac/Linux:**
```bash
./start.sh
```

**On Windows:**
```
start.bat
```

The script will:
- Check if Node.js is installed
- Install required dependencies (first time only)
- Start the server

### Step 4: Open in Browser

Once the server starts, you'll see:
```
╔════════════════════════════════════════╗
║   Project Overviewer Server Running   ║
╠════════════════════════════════════════╣
║                                        ║
║   URL: http://localhost:3000           ║
║                                        ║
║   Database: projects.db (SQLite)      ║
║                                        ║
║   Press Ctrl+C to stop the server     ║
║                                        ║
╚════════════════════════════════════════╝
```

Open your web browser and go to: **http://localhost:3000**

That's it! The app should now be running.

---

## 📖 Quick Start Guide

### Step-by-Step Guide (For Dummies)

1. **Start the app** and open `http://localhost:3000` (see “How to Setup and Run the App” above).
2. **Click the “+ New Project” button** in the header to open the creation modal.
3. **Fill every field**: title, stakeholder, description, status, priority (hidden for backlog), optional due date, tags.
4. **Submit the form** to bump the card into the view you are currently in.
5. **Use the Kanban board** to drag cards between `backlog`, `not-started`, `in-progress`, and `completed`; each lane shows its current WIP total and lets you type a limit.
6. **Use inline controls** on any card to adjust status, priority, or stakeholder; hit “Undo” on the toast if you goof.
7. **Sort results** with the dropdown (manual, due date, priority, title, stakeholder, updated) or search using the sidebar input.

Follow the rest of this document to expand on each step.

### Creating Your First Project

1. **Click the "+ New Project" button** in the top-right corner
2. A new project card will appear with the title "New Project"
3. **Click on "New Project"** to edit the title - type your project name and press Enter
4. **Double-click anywhere on the project card** to open the full details panel

### Adding Project Details

When you double-click a project, a popup will appear where you can set:

- **Title** - The name of your project
- **Description** - What this project is about
- **Status** - Choose from:
-  - `backlog` (requires priority = None)
-  - `not-started`
-  - `in-progress`
-  - `completed`
- **Priority** - Choose from:
  - High (red indicator)
  - Medium (yellow indicator)
  - Low (green indicator)
  - None (gray indicator)
- **Due Date** - Click the date field to pick a deadline
- **Tags** - Add labels like "urgent, design, frontend" (separate with commas)

Click "Done" when you're finished.

### Adding Tasks to a Project

1. Find the project card you want to add tasks to
2. At the bottom of the card, you'll see "+ Add a task..."
3. **Click in the text box** and type your task name
4. **Press Enter** to add the task

The task will appear above the input box with an empty circle next to it.

### Completing Tasks

- **Click the circle** next to any task to mark it complete
- The circle will fill with a checkmark and turn green
- The task text will have a line through it
- Your project's progress bar will update automatically

### Viewing Tasks

- Each project card shows up to 5 tasks
- If you have more than 5, you'll see "+X more tasks" at the bottom
- Double-click the project to see all tasks in the detail view

---

## 🗂️ Using the Sidebar

The left sidebar helps you filter and organize your projects.

### Main Views

- **📁 All Projects** - Everything in the system
- **🧱 Kanban** - Four colored lanes (`backlog`, `not-started`, `in-progress`, `completed`) plus lane WIP totals and drag-and-drop.
- **🟦 not-started** - Shows cards planned but not started yet
- **🚀 in-progress** - Only work currently underway
- **📋 backlog** - Work that hasn't been prioritized (priority is forced to None)
- **✅ completed** - Already done

### Smart Filters

- **⚠️ Overdue** - Projects past their due date
- **📅 Due Today** - Projects due today
- **📆 This Week** - Projects due within 7 days
- **👤 Stakeholders** — filters appear once you assign stakeholder names

### Priority Filters

- **🔴 High Priority** - Only urgent projects
- **🟡 Medium Priority** - Medium importance
- **🟢 Low Priority** - Low importance

### Tag Filters

Once you add tags to your projects, they'll appear in a "Tags" section at the bottom of the sidebar. Click any tag to filter by that tag.

### Hiding the Sidebar

Click the **☰** button in the top-left corner to collapse/expand the sidebar.

---

## 🔍 Searching

1. Click the search box at the top of the sidebar (or press **⌘F** on Mac / **Ctrl+F** on Windows)
2. Type any text
3. The app will search through:
   - Project titles
   - Project descriptions
   - Task names

Results appear instantly as you type.

---

## ⚙️ Settings

Click the **⚙️** gear icon in the top-right corner (or press **⌘,** on Mac / **Ctrl+,** on Windows).

### Theme Options

- **☀️ Light** - Bright, clean interface
- **🌙 Dark** - Easy on the eyes in low light
- **🌓 Auto** - Matches your computer's system theme

### Export & Import Data

**Export Data:**
1. Click "📤 Export Data"
2. A file will download to your computer
3. This saves all your projects and tasks as a backup

**Import Data:**
1. Click "📥 Import Data"
2. Select a previously exported file
3. Your data will be restored

**Important:** Export your data regularly as a backup!

---

## ⌨️ Keyboard Shortcuts (Time Savers!)

| Shortcut | What It Does |
|----------|--------------|
| **⌘K** (Mac) or **Ctrl+K** (Windows) | Open command palette |
| **⌘N** (Mac) or **Ctrl+N** (Windows) | Create new project |
| **⌘F** (Mac) or **Ctrl+F** (Windows) | Focus search box |
| **⌘I** (Mac) or **Ctrl+I** (Windows) | View statistics |
| **⌘,** (Mac) or **Ctrl+,** (Windows) | Open settings |
| **⌘S** (Mac) or **Ctrl+S** (Windows) | Force save data |
| **⌘⇧N** (Mac) or **Ctrl+Shift+N** (Windows) | Open quick notes |
| **Esc** | Close any popup/modal |
| **Enter** | Finish editing text |

### What's the Command Palette?

Press **⌘K** (Mac) or **Ctrl+K** (Windows) to open a powerful search tool that lets you:
- Quickly jump to any project
- Run any command
- Switch themes
- Access all features without using the mouse

Just start typing and press Enter when you see what you want!

---

## 📊 Statistics Dashboard

Click the **📊** icon in the top-right (or press **⌘I**) to see:
- Total number of projects
- Tasks completed vs. total tasks
- Active projects count
- Completed projects count
- Visual breakdown of project statuses

---

## 📝 Quick Notes (Scratch Pad)

Press **⌘⇧N** (Mac) or **Ctrl+Shift+N** (Windows) to open a floating notepad.

Use it for:
- Quick thoughts
- Meeting notes
- Ideas you want to remember

**Pro tip:** Write a note and click "Convert to Task" to instantly turn it into a task in your first project!

---

## 🎯 Focus Mode

Click the **🎯** target icon in the top-right to hide the sidebar and remove distractions. Perfect when you want to concentrate on your current work.

Click again to exit focus mode.

---

## 🎨 Drag and Drop Reordering

You can reorganize your projects by dragging and dropping:

1. **Click and hold** on any project card
2. **Drag** it to where you want it
3. **Release** to drop it in the new position

Your order is saved automatically.

---

## 💡 Tips and Tricks

### Color-Coded Priorities
Each project has a colored bar on the left side:
- **Red** = High priority
- **Yellow** = Medium priority
- **Green** = Low priority
- **Gray** = No priority set

### Progress Bars
The blue bar on each project card shows your progress:
- 0% = No tasks completed
- 50% = Half your tasks done
- 100% = All tasks complete!

### Due Date Alerts
Due dates are color-coded:
- **Red text** = Overdue (past the deadline)
- **Normal text** = On track

### Smart Due Dates
The app shows friendly date formats:
- "Today" - due today
- "Tomorrow" - due tomorrow
- "In 3 days" - due soon
- "2 days overdue" - past deadline

### Auto-Save
Your data saves automatically every 2 seconds. You'll see a small "Saved" notification when it happens.

### Multiple Browsers
You can open the app in different browser windows, but be careful - only the changes in the last window you used will be saved. It's best to use one window at a time.

---

## 🗑️ Deleting Projects

1. **Double-click** a project to open its details
2. Click the **🗑️ Delete** button at the bottom
3. Confirm you want to delete it

**Warning:** Deleted projects cannot be recovered unless you have an exported backup!

---

## 💾 Where Is My Data Saved?

Your data is saved in a **SQLite database file** called `projects.db` in the Project-Overviewer folder.

✅ **Good news:**
- Your data is private and stays on your computer
- Database is reliable and persistent
- No sign-up or account needed
- Completely free
- Data survives browser cache clearing
- Can be accessed from any browser on the same computer

✅ **Database benefits:**
- Professional-grade SQLite database (used by millions of apps)
- Automatic data integrity checks
- Transaction safety (no partial saves)
- Efficient storage and fast queries

⚠️ **Important to know:**
- Data is saved in the `projects.db` file in your Project-Overviewer folder
- **Backup this file regularly!** (or use the export feature)
- If you delete the `projects.db` file, all data is lost
- To move to another computer, copy the entire Project-Overviewer folder

---

## 🆘 Troubleshooting

### "My projects disappeared!"
- Check if `projects.db` file exists in the Project-Overviewer folder
- The server must be running (start it with `./start.sh` or `start.bat`)
- **Solution:** If you have an exported backup, use Import Data

### "The app won't start"
- Make sure Node.js is installed: run `node --version` in terminal
- Make sure you're in the correct folder: `cd /Users/hwitzthum/Project-Overviewer`
- Try deleting `node_modules` folder and running `npm install`
- Check if port 3000 is already in use by another app

### "Changes aren't saving"
- Make sure the server is still running (check the terminal)
- Check browser console for errors (F12 → Console tab)
- Try refreshing the page
- Restart the server (Ctrl+C, then run start script again)

### "Can't connect to http://localhost:3000"
- Make sure the server is running (check the terminal)
- Try closing and reopening your browser
- Make sure no firewall is blocking port 3000

### "I need to use this on another computer"
**Method 1: Export/Import (Recommended)**
1. Export your data on the first computer (📤 Export Data button)
2. Copy the entire Project-Overviewer folder to the other computer
3. Start the app on the second computer
4. Import your data file (📥 Import Data button)

**Method 2: Copy Database File**
1. Stop the server on the first computer (Ctrl+C)
2. Copy the entire Project-Overviewer folder (includes `projects.db`)
3. Paste it on the second computer
4. Start the server using the start script

---

## 🎓 Example Workflow

Here's how you might use Project Overviewer for a real project:

1. **Create a project** called "Launch New Website"
2. **Set priority** to High
3. **Set due date** to your launch date
4. **Add tags:** "web, design, urgent"
5. **Add tasks:**
   - Design homepage mockup
   - Write content
   - Build HTML/CSS
   - Test on mobile
   - Deploy to hosting
6. **Check off tasks** as you complete them
7. Watch the progress bar fill up!
8. When done, change status to "Done"

### 🎯 Typical Use Case

Use Project Overviewer to manage a marketing campaign:

1. Start in the Kanban view with lanes colored and labeled for `backlog`, `not-started`, `in-progress`, and `completed`.
2. Set lane WIP limits by typing a number into the “WIP” input so the design team can focus on four cards at a time.
3. Create the “Campaign Launch” project, choose stakeholder “Marketing”, set status `not-started`, priority High, due date, and tags `campaign` and `promo`.
4. Add tasks for research, creative review, asset production, QA, and launch, checking them off as they finish; the inline quick controls keep stakeholder and priority current if the scope changes.
5. Drag the card from `not-started` to `in-progress`, then to `completed` when the launch is live; due-date badges and totals help you spot overdue steps.
6. Use the stakeholder sidebar filter to isolate work for “Finance” or “Marketing” whenever leadership asks for a readout.
7. Export the data after every sprint for a safe backup, and import it on another machine if needed.

This workflow keeps accountability tight—every card shows progress, priority, stakeholders, and due dates while the Kanban board honors your capacity limits.

---

## 🌟 Advanced Features

### Recurring Tasks (Coming Soon)
While editing a task in the detail view, you can set it to repeat daily, weekly, or monthly. When you complete it, a new copy will automatically be created for the next occurrence.

### Task Templates
The app includes three built-in templates:
- Bug Report workflow
- Feature Request workflow
- Meeting Notes workflow

These can be accessed through the command palette (⌘K).

---

## ❓ Frequently Asked Questions

**Q: Is my data secure?**
A: Yes! Everything stays on your computer. Nothing is sent to the internet.

**Q: Can I use this offline?**
A: Yes! Once you've opened the file once, it works completely offline.

**Q: Can multiple people collaborate?**
A: Not directly. This app is designed for personal use. To share, you'd need to export and send your data file.

**Q: Can I customize the colors/appearance?**
A: The theme system (Light/Dark/Auto) is built-in. For further customization, you'd need to edit the HTML file's CSS.

**Q: How many projects can I create?**
A: As many as your browser's storage allows (usually thousands). But for best performance, try to keep it under 100 active projects.

**Q: Can I add attachments or images?**
A: Not currently. This is a text-based tool focused on simplicity.

---

## 🎉 You're All Set!

You now know everything you need to manage your projects like a pro. Remember:

1. **Create projects** with the + button
2. **Add tasks** to break down your work
3. **Check off tasks** as you complete them
4. **Use filters** to focus on what matters
5. **Export regularly** to back up your data

Happy organizing! 🚀

---

## 📞 Need More Help?

If you have questions or run into issues:
- Review this guide
- Try the command palette (⌘K) to explore features
- Check the Statistics dashboard to see your progress
- Export your data regularly as a safety net

Remember: This app is entirely self-contained in one HTML file. Keep that file safe, and you'll always have access to your project manager!
