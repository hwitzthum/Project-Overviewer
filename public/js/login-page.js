const LOGIN_ERROR_ICON = '<circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="5" x2="8" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11.5" r="0.5" fill="currentColor"/>';
const LOGIN_SUCCESS_ICON = '<circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><polyline points="5.5 8.5 7.5 10.5 11 6.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>';

function initLoginThemePicker() {
  applyTheme(getStoredThemePreference(), { persist: false });
  bindThemeControls({ selector: '.theme-dot' });
}

function showLoginMessage(type, text) {
  const el = document.getElementById('message');
  const icon = document.getElementById('msg-icon');
  const msgText = document.getElementById('msg-text');

  el.className = `auth-message visible ${type}`;
  msgText.textContent = text;
  icon.innerHTML = type === 'success' ? LOGIN_SUCCESS_ICON : LOGIN_ERROR_ICON;
}

function hideLoginMessage() {
  document.getElementById('message').className = 'auth-message';
}

function initLoginPage() {
  initLoginThemePicker();
  markThemeReady();
  markPageReady();

  document.getElementById('togglePwd').addEventListener('click', function() {
    const input = document.getElementById('password');
    const eyeOpen = this.querySelector('.eye-open');
    const eyeClosed = this.querySelector('.eye-closed');
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    eyeOpen.style.display = isPassword ? 'none' : '';
    eyeClosed.style.display = isPassword ? '' : 'none';
  });

  document.getElementById('loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    hideLoginMessage();

    const btn = document.getElementById('submitBtn');
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    if (!username || !password) {
      showLoginMessage('error', 'Please enter your username and password.');
      return;
    }

    btn.classList.add('loading');
    btn.disabled = true;

    try {
      const themePreference = document.documentElement.getAttribute('data-theme-preference') || getStoredThemePreference();
      try {
        sessionStorage.setItem('theme_boot_preference', themePreference);
      } catch {
        // Ignore storage failures in restricted browsing modes.
      }
      await API.login(username, password);
      applyTheme(themePreference);
      showLoginMessage('success', 'Signed in successfully. Redirecting...');
      setTimeout(() => {
        window.location.replace('/');
      }, 500);
    } catch (error) {
      showLoginMessage('error', error.message || 'Sign in failed. Please try again.');
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  });
}

window.addEventListener('DOMContentLoaded', initLoginPage);
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  API.getMe().then(() => {
    window.location.replace('/');
  }).catch(() => {
    // Stay on the sign-in page when there is no session.
  });
});
