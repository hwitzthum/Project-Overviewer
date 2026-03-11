// Project Overviewer — Command Palette
var commands = [
  { id: 'new-project', icon: '📁', title: 'New Project', desc: 'Create a new project', shortcut: '⌘N', action: createProject },
  { id: 'search', icon: '🔍', title: 'Search', desc: 'Search projects and tasks', shortcut: '⌘F', action: () => document.getElementById('searchInput').focus() },
  { id: 'settings', icon: '⚙️', title: 'Settings', desc: 'Open settings', shortcut: '⌘,', action: () => openModal('settingsModal') },
  { id: 'stats', icon: '📊', title: 'Statistics', desc: 'View statistics dashboard', shortcut: '⌘I', action: renderStatistics },
  { id: 'export', icon: '📤', title: 'Export Data', desc: 'Export all data to JSON', action: exportData },
  { id: 'notes', icon: '📝', title: 'Quick Notes', desc: 'Open scratch pad', shortcut: '⌘⇧N', action: () => document.getElementById('quickNotes').classList.toggle('active') },
  { id: 'focus', icon: '🎯', title: 'Focus Mode', desc: 'Toggle distraction-free mode', action: toggleFocusMode },
  { id: 'theme-light', icon: '☀️', title: 'Light Theme', desc: 'Switch to light theme', action: () => { setState(s => ({ settings: { ...s.settings, theme: 'light' } })); applyTheme('light'); } },
  { id: 'theme-dark', icon: '🌙', title: 'Dark Theme', desc: 'Switch to dark theme', action: () => { setState(s => ({ settings: { ...s.settings, theme: 'dark' } })); applyTheme('dark'); } },
  { id: 'theme-ocean', icon: '🌊', title: 'Ocean Theme', desc: 'Switch to ocean theme', action: () => { setState(s => ({ settings: { ...s.settings, theme: 'ocean' } })); applyTheme('ocean'); } },
  { id: 'theme-forest', icon: '🌲', title: 'Forest Theme', desc: 'Switch to forest theme', action: () => { setState(s => ({ settings: { ...s.settings, theme: 'forest' } })); applyTheme('forest'); } },
  { id: 'theme-auto', icon: '🌓', title: 'Auto Theme', desc: 'Match system preference', action: () => { setState(s => ({ settings: { ...s.settings, theme: 'auto' } })); applyTheme('auto'); } }
];

var commandPaletteOpen = false;
var selectedCommandIndex = 0;

function openCommandPalette() {
  commandPaletteOpen = true;
  selectedCommandIndex = 0;
  document.getElementById('commandPalette').classList.add('active');
  document.getElementById('commandInput').value = '';
  document.getElementById('commandInput').focus();
  renderCommands('');
}

function closeCommandPalette() {
  commandPaletteOpen = false;
  document.getElementById('commandPalette').classList.remove('active');
}

function renderCommands(query) {
  const q = query.toLowerCase();
  let items = commands.filter(c =>
    c.title.toLowerCase().includes(q) ||
    c.desc.toLowerCase().includes(q)
  );

  // Add projects to search
  if (q) {
    const matchingProjects = state.projects.filter(p =>
      p.title.toLowerCase().includes(q)
    ).slice(0, 5);

    items = [
      ...items,
      ...matchingProjects.map(p => ({
        id: `project-${p.id}`,
        icon: '📋',
        title: p.title,
        desc: `Open project`,
        action: () => openProjectModal(p.id)
      }))
    ];
  }

  const resultsEl = document.getElementById('commandResults');
  resultsEl.innerHTML = items.map((cmd, i) => `
    <div class="command-item${i === selectedCommandIndex ? ' selected' : ''}" data-index="${i}">
      <span class="command-item-icon">${cmd.icon}</span>
      <div class="command-item-text">
        <div class="command-item-title">${escapeHtml(cmd.title)}</div>
        <div class="command-item-desc">${escapeHtml(cmd.desc)}</div>
      </div>
      ${cmd.shortcut ? `<span class="command-item-shortcut">${cmd.shortcut}</span>` : ''}
    </div>
  `).join('');

  // Attach click listeners
  resultsEl.querySelectorAll('.command-item').forEach((el, i) => {
    el.onclick = () => {
      items[i].action();
      closeCommandPalette();
    };
  });
}

function toggleFocusMode() {
  document.getElementById('app').classList.toggle('focus-mode');
}