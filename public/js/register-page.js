function initRegisterThemePicker() {
  applyTheme(getStoredThemePreference(), { persist: false });
  bindThemeControls({ selector: '.theme-dot' });
}

function createRegisterIcon(type) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '8');
  circle.setAttribute('cy', '8');
  circle.setAttribute('r', '7');
  circle.setAttribute('fill', 'none');
  circle.setAttribute('stroke', 'currentColor');
  circle.setAttribute('stroke-width', '1.5');
  svg.appendChild(circle);

  if (type === 'error') {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '8');
    line.setAttribute('y1', '5');
    line.setAttribute('x2', '8');
    line.setAttribute('y2', '9');
    line.setAttribute('stroke', 'currentColor');
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('stroke-linecap', 'round');
    svg.appendChild(line);

    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', '8');
    dot.setAttribute('cy', '11.5');
    dot.setAttribute('r', '0.5');
    dot.setAttribute('fill', 'currentColor');
    svg.appendChild(dot);
  } else {
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    poly.setAttribute('points', '5.5 8.5 7.5 10.5 11 6.5');
    poly.setAttribute('fill', 'none');
    poly.setAttribute('stroke', 'currentColor');
    poly.setAttribute('stroke-width', '1.5');
    poly.setAttribute('stroke-linecap', 'round');
    poly.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(poly);
  }

  return svg;
}

function showRegisterMessage(type, text) {
  const el = document.getElementById('message');
  const iconWrap = document.getElementById('msg-icon-wrap');
  const msgText = document.getElementById('msg-text');

  el.className = `auth-message visible ${type}`;
  msgText.textContent = text;
  iconWrap.textContent = '';
  iconWrap.appendChild(createRegisterIcon(type));
}

function hideRegisterMessage() {
  document.getElementById('message').className = 'auth-message';
}

function getPasswordStrength(password) {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 4);
}

function checkRegisterPageSession() {
  markPagePending();
  API.getMe().then(() => {
    window.location.replace('/');
  }).catch(() => {
    markThemeReady();
    markPageReady();
  });
}

function initRegisterPage() {
  initRegisterThemePicker();
  checkRegisterPageSession();
  const hints = ['', 'Weak', 'Fair', 'Good', 'Strong'];

  document.getElementById('togglePwd1').addEventListener('click', function() {
    const input = document.getElementById('password');
    const eyeOpen = this.querySelector('.eye-open');
    const eyeClosed = this.querySelector('.eye-closed');
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    eyeOpen.style.display = isPassword ? 'none' : '';
    eyeClosed.style.display = isPassword ? '' : 'none';
  });

  document.getElementById('password').addEventListener('input', event => {
    const strength = getPasswordStrength(event.target.value);
    document.getElementById('pwdStrength').setAttribute('data-strength', strength);
    document.getElementById('pwdHint').textContent = event.target.value ? hints[strength] : '';
  });

  document.getElementById('registerForm').addEventListener('submit', async event => {
    event.preventDefault();
    hideRegisterMessage();

    const btn = document.getElementById('submitBtn');
    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirm = document.getElementById('confirmPassword').value;

    if (!username || !email || !password || !confirm) {
      showRegisterMessage('error', 'All fields are required.');
      return;
    }

    if (username.length < 3) {
      showRegisterMessage('error', 'Username must be at least 3 characters.');
      return;
    }

    if (password.length < 8) {
      showRegisterMessage('error', 'Password must be at least 8 characters.');
      return;
    }

    if (password !== confirm) {
      showRegisterMessage('error', 'Passwords do not match.');
      return;
    }

    btn.classList.add('loading');
    btn.disabled = true;

    try {
      await API.register(username, email, password);
      document.getElementById('registerForm').style.display = 'none';
      document.getElementById('message').className = 'auth-message';
      document.getElementById('pendingState').style.display = 'block';
    } catch (error) {
      showRegisterMessage('error', error.message || 'Registration failed. Please try again.');
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  });
}

window.addEventListener('DOMContentLoaded', initRegisterPage);
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  checkRegisterPageSession();
});
