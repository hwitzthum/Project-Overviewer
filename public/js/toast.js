// Project Overviewer — Toast Notifications

function showToast(message, type = 'info', options = {}) {
  const {
    actionLabel = null,
    onAction = null,
    duration = 3000
  } = options;

  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const msgSpan = document.createElement('span');
  msgSpan.className = 'toast-message';
  msgSpan.textContent = message;
  toast.appendChild(msgSpan);

  if (actionLabel && typeof onAction === 'function') {
    const actionBtn = document.createElement('button');
    actionBtn.className = 'toast-action';
    actionBtn.type = 'button';
    actionBtn.textContent = actionLabel;
    actionBtn.addEventListener('click', async () => {
      toast.remove();
      try {
        await onAction();
      } catch (error) {
        console.error('Toast action failed:', error);
        showToast('Action failed', 'error');
      }
    });
    toast.appendChild(actionBtn);
  }

  container.appendChild(toast);
  var timeout = setTimeout(() => toast.remove(), duration);
  toast.addEventListener('mouseenter', () => clearTimeout(timeout), { once: true });
  toast.addEventListener('mouseleave', () => {
    timeout = setTimeout(() => toast.remove(), duration);
  }, { once: true });
}