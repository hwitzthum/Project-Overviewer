// Project Overviewer — Keyboard Shortcuts
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
      // Close the topmost modal only (priority order: confirm > stats > project > create > settings)
      const modalStack = ['confirmModal', 'statsModal', 'projectModal', 'createProjectModal', 'settingsModal'];
      let closed = false;
      for (const id of modalStack) {
        const modal = document.getElementById(id);
        if (modal && modal.classList.contains('active')) {
          closeModal(id);
          closed = true;
          break;
        }
      }
      if (!closed) {
        document.getElementById('quickNotes').classList.remove('active');
      }
    }
  });
}