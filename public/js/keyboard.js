// Project Overviewer — Keyboard Shortcuts
function isTypingInInput() {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

function initKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    const isMeta = e.metaKey || e.ctrlKey;

    // Command palette navigation
    if (commandPaletteOpen) {
      if (e.key === 'Escape') {
        closeCommandPalette();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const items = document.querySelectorAll('.command-item');
        selectedCommandIndex = Math.min(selectedCommandIndex + 1, items.length - 1);
        items.forEach((el, i) => el.classList.toggle('selected', i === selectedCommandIndex));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const items = document.querySelectorAll('.command-item');
        selectedCommandIndex = Math.max(selectedCommandIndex - 1, 0);
        items.forEach((el, i) => el.classList.toggle('selected', i === selectedCommandIndex));
      }
      if (e.key === 'Enter') {
        const selected = document.querySelector('.command-item.selected');
        if (selected) selected.click();
      }
      return;
    }

    // Global shortcuts
    if (isMeta && e.key === 'k') {
      e.preventDefault();
      openCommandPalette();
    }
    if (isMeta && e.key === 'n') {
      e.preventDefault();
      createProject();
    }
    if (isMeta && e.key === 'f') {
      e.preventDefault();
      document.getElementById('searchInput').focus();
    }
    if (isMeta && e.key === ',') {
      e.preventDefault();
      openModal('settingsModal');
    }
    if (isMeta && e.key === 'i') {
      e.preventDefault();
      renderStatistics();
    }
    if (isMeta && e.key === 's') {
      e.preventDefault();
      // Data saves automatically via API — just prevent browser save dialog
    }
    if (isMeta && e.shiftKey && e.key === 'N') {
      e.preventDefault();
      document.getElementById('quickNotes').classList.toggle('active');
    }
    if (e.key === 'Escape') {
      const topModalId = getTopModalId();
      if (topModalId) {
        closeModal(topModalId);
      } else {
        document.getElementById('quickNotes').classList.remove('active');
      }
    }

    // Single-key shortcuts — skip when typing in inputs
    if (!isMeta && !e.altKey && !isTypingInInput()) {
      if ((e.key === 'n' || e.key === 'N') && !e.shiftKey) {
        e.preventDefault();
        createProject();
      }
      if (e.key === '/' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('searchInput').focus();
      }
      if (e.key === '?') {
        e.preventDefault();
        openModal('shortcutsModal');
      }
    }
  });
}
