// Theme boot script — runs synchronously before CSS to prevent theme flicker.
(() => {
  const darkFamily = new Set(['dark', 'ocean', 'forest']);
  const chrome = { light: '#efe4d0', dark: '#0a1014', ocean: '#0a2230', forest: '#172117' };
  let preference = 'auto';
  try {
    const themeCookie = document.cookie
      .split(';')
      .map(part => part.trim())
      .find(part => part.startsWith('theme_preference='));
    preference = sessionStorage.getItem('theme_boot_preference')
      || localStorage.getItem('theme')
      || (themeCookie ? decodeURIComponent(themeCookie.split('=').slice(1).join('=')) : null)
      || 'auto';
  } catch {}
  const effective = preference === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : preference;
  document.documentElement.setAttribute('data-theme', effective);
  document.documentElement.setAttribute('data-theme-preference', preference);
  document.documentElement.setAttribute('data-theme-ready', 'false');
  document.documentElement.style.colorScheme = darkFamily.has(effective) ? 'dark' : 'light';
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) themeColorMeta.setAttribute('content', chrome[effective] || chrome.light);
})();