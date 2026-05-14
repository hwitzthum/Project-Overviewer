// Account settings — self-service change password from Settings modal

function scorePasswordStrength(password) {
  let score = 0;
  if (!password) return score;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  return score;
}

const STRENGTH_LABELS = [
  "Too short",
  "Weak",
  "Fair",
  "Good",
  "Strong",
  "Very strong",
];

function updateStrengthMeter(password) {
  const wrap = document.getElementById("newPasswordStrength");
  if (!wrap) return;
  const bar = wrap.querySelector(".password-strength-bar > span");
  const label = wrap.querySelector(".password-strength-label");
  const score = scorePasswordStrength(password);
  if (bar) {
    bar.style.width = `${(score / 5) * 100}%`;
    bar.dataset.score = String(score);
  }
  if (label) {
    if (!password) {
      label.textContent = "Enter at least 12 characters";
    } else if (password.length < 12) {
      label.textContent = "Too short — minimum 12 characters";
    } else {
      label.textContent = STRENGTH_LABELS[score] || "Weak";
    }
  }
}

function setMessage(text, type) {
  const el = document.getElementById("changePasswordMessage");
  if (!el) return;
  if (!text) {
    el.style.display = "none";
    el.textContent = "";
    el.className = "change-password-message";
    return;
  }
  el.textContent = text;
  el.className = `change-password-message ${type || "error"}`;
  el.style.display = "";
}

function wirePasswordToggle(button) {
  button.addEventListener("click", () => {
    const targetId = button.dataset.target;
    const input = document.getElementById(targetId);
    if (!input) return;
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    button.setAttribute(
      "aria-label",
      showing ? "Show password" : "Hide password",
    );
  });
}

async function handleChangePasswordSubmit(event) {
  event.preventDefault();
  const currentInput = document.getElementById("currentPassword");
  const newInput = document.getElementById("newPassword");
  const confirmInput = document.getElementById("confirmPassword");
  const submitBtn = document.getElementById("changePasswordSubmit");
  if (!currentInput || !newInput || !confirmInput || !submitBtn) return;

  const currentPassword = currentInput.value;
  const newPassword = newInput.value;
  const confirmPassword = confirmInput.value;

  if (!currentPassword || !newPassword || !confirmPassword) {
    setMessage("Please fill in all three fields.", "error");
    return;
  }
  if (newPassword.length < 12) {
    setMessage("New password must be at least 12 characters.", "error");
    newInput.focus();
    return;
  }
  if (newPassword === currentPassword) {
    setMessage(
      "New password must be different from the current password.",
      "error",
    );
    newInput.focus();
    return;
  }
  if (newPassword !== confirmPassword) {
    setMessage("New password and confirmation do not match.", "error");
    confirmInput.focus();
    return;
  }

  submitBtn.disabled = true;
  const originalLabel = submitBtn.textContent;
  submitBtn.textContent = "Saving…";
  setMessage("Updating password…", "info");
  try {
    await API.changePassword(currentPassword, newPassword);
    setMessage(
      "✅ Password saved. Use your new password next time you log in. Other sessions have been signed out.",
      "success",
    );
    currentInput.value = "";
    newInput.value = "";
    confirmInput.value = "";
    updateStrengthMeter("");
    const messageEl = document.getElementById("changePasswordMessage");
    if (messageEl && typeof messageEl.scrollIntoView === "function") {
      messageEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (typeof showToast === "function") {
      showToast("Password saved", "success");
    }
  } catch (error) {
    setMessage(error.message || "Failed to change password.", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
  }
}

function initAccountSettings() {
  const form = document.getElementById("changePasswordForm");
  if (!form) return;

  form.addEventListener("submit", handleChangePasswordSubmit);

  const newInput = document.getElementById("newPassword");
  if (newInput) {
    newInput.addEventListener("input", () => {
      updateStrengthMeter(newInput.value);
      setMessage("", null);
    });
  }
  const currentInput = document.getElementById("currentPassword");
  const confirmInput = document.getElementById("confirmPassword");
  if (currentInput)
    currentInput.addEventListener("input", () => setMessage("", null));
  if (confirmInput)
    confirmInput.addEventListener("input", () => setMessage("", null));

  document
    .querySelectorAll("#changePasswordForm .password-toggle")
    .forEach(wirePasswordToggle);

  const settingsModal = document.getElementById("settingsModal");
  if (settingsModal) {
    settingsModal.addEventListener("click", (event) => {
      const target = event.target;
      if (
        target &&
        (target.classList.contains("modal-close") ||
          target.classList.contains("modal-overlay"))
      ) {
        if (currentInput) currentInput.value = "";
        if (newInput) newInput.value = "";
        if (confirmInput) confirmInput.value = "";
        updateStrengthMeter("");
        setMessage("", null);
      }
    });
  }

  updateStrengthMeter("");
}

window.AccountSettings = { init: initAccountSettings };
