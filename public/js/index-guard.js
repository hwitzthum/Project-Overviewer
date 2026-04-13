(function initProtectedPageGuard() {
  const root = document.documentElement;
  let authPromise = null;

  async function verifySession() {
    root.setAttribute('data-auth-state', 'pending');
    const user = await API.getMe();
    root.setAttribute('data-auth-state', 'authorized');
    window.__authenticatedUser = user;
    return user;
  }

  function ensureProtectedPageAuth() {
    if (!authPromise) {
      authPromise = verifySession().catch(error => {
        root.setAttribute('data-auth-state', 'redirecting');
        window.location.replace('/login.html');
        throw error;
      });
    }
    return authPromise;
  }

  window.ensureProtectedPageAuth = ensureProtectedPageAuth;
  ensureProtectedPageAuth().catch(() => {});

  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    authPromise = null;
    root.setAttribute('data-auth-state', 'pending');
    ensureProtectedPageAuth().catch(() => {});
  });
})();
