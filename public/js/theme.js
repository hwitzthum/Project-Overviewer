// Project Overviewer — Theme Management

function applyTheme(theme) {
  let effectiveTheme = theme;
  if (theme === 'auto') {
    effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', effectiveTheme);

  // Update settings UI
  document.querySelectorAll('[data-theme]').forEach(el => {
    el.classList.toggle('active', el.dataset.theme === theme);
  });
}