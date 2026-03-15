// Project Overviewer — Theme Management

const THEME_STORAGE_KEY = 'theme';
const THEME_COOKIE_KEY = 'theme_preference';
const DARK_FAMILY_THEMES = new Set(['dark', 'ocean', 'forest']);
const THEME_CHROME_COLORS = {
  light: '#efe4d0',
  dark: '#0a1014',
  ocean: '#0a2230',
  forest: '#172117'
};

function getStoredThemePreference() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY)
      || readThemePreferenceCookie()
      || document.documentElement.getAttribute('data-theme-preference')
      || 'auto';
  } catch {
    return readThemePreferenceCookie()
      || document.documentElement.getAttribute('data-theme-preference')
      || 'auto';
  }
}

function readThemePreferenceCookie() {
  if (typeof document === 'undefined' || typeof document.cookie !== 'string') return null;
  const prefix = `${THEME_COOKIE_KEY}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

function writeThemePreferenceCookie(preference) {
  if (typeof document === 'undefined') return;
  document.cookie = `${THEME_COOKIE_KEY}=${encodeURIComponent(preference)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function resolveThemePreference(theme) {
  const preference = theme || 'auto';
  if (preference === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return preference;
}

function updateThemeChrome(effectiveTheme) {
  document.documentElement.style.colorScheme = DARK_FAMILY_THEMES.has(effectiveTheme) ? 'dark' : 'light';
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.setAttribute('content', THEME_CHROME_COLORS[effectiveTheme] || THEME_CHROME_COLORS.light);
  }
}

function applyTheme(theme, options = {}) {
  const { persist = true } = options;
  const preference = theme || 'auto';
  const effectiveTheme = resolveThemePreference(preference);

  document.documentElement.setAttribute('data-theme', effectiveTheme);
  document.documentElement.setAttribute('data-theme-preference', preference);
  updateThemeChrome(effectiveTheme);

  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // Ignore storage failures in restricted browsing modes.
    }
    writeThemePreferenceCookie(preference);
  }

  document.querySelectorAll('[data-theme]').forEach(el => {
    if (el === document.documentElement) return;
    el.classList.toggle('active', el.dataset.theme === preference);
  });

  return effectiveTheme;
}

function bindThemeControls(options = {}) {
  const { selector = '[data-theme]', onThemeChange } = options;
  document.querySelectorAll(selector).forEach(control => {
    if (control === document.documentElement || control.dataset.themeBound === 'true') return;
    if (!control.dataset.theme) return;
    control.dataset.themeBound = 'true';
    control.addEventListener('click', async () => {
      const theme = control.dataset.theme;
      applyTheme(theme);
      if (typeof onThemeChange === 'function') {
        await onThemeChange(theme);
      }
    });
  });
}

function markThemeReady() {
  document.documentElement.setAttribute('data-theme-ready', 'true');
}
