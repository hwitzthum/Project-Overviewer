const MIN_PASSWORD_LENGTH = 12;
const MIN_ADMIN_PASSWORD_LENGTH = 14;
const MAX_PASSWORD_LENGTH = 128;

const COMMON_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  '12345678901',
  '123456789012',
  'admin123',
  'changeme',
  'iloveyou',
  'letmein',
  'password',
  'password1',
  'password12',
  'password123',
  'password1234',
  'qwerty123',
  'qwertyuiop',
  'welcome123'
]);

// IMPORTANT: Do NOT trim the password here. The raw password (with any leading/
// trailing whitespace) is what gets hashed. Trimming before validation but not
// before hashing would create an inconsistency where a password that passes
// validation is stored as a different (untrimmed) hash, breaking login for
// users whose passwords include surrounding whitespace. If trimming is desired
// for display purposes, do it only in the UI layer — never before hashing.
function normalizePassword(value) {
  return String(value || '');
}

function getMinimumPasswordLength(role = 'user') {
  return role === 'admin' ? MIN_ADMIN_PASSWORD_LENGTH : MIN_PASSWORD_LENGTH;
}

function validatePasswordPolicy({ password, username = '', email = '', role = 'user' }) {
  const normalizedPassword = normalizePassword(password);
  const minimumLength = getMinimumPasswordLength(role);

  if (normalizedPassword.length < minimumLength) {
    return {
      valid: false,
      message: `Password must be at least ${minimumLength} characters.`,
      reason: 'min_length'
    };
  }

  if (normalizedPassword.length > MAX_PASSWORD_LENGTH) {
    return {
      valid: false,
      message: `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`,
      reason: 'max_length'
    };
  }

  const loweredPassword = normalizedPassword.toLowerCase();
  const loweredUsername = String(username || '').trim().toLowerCase();
  const loweredEmailLocalPart = String(email || '').split('@')[0].trim().toLowerCase();

  if (COMMON_PASSWORDS.has(loweredPassword) || /^(password|qwerty|letmein|welcome|admin|changeme)/i.test(normalizedPassword)) {
    return {
      valid: false,
      message: 'Password is too common or previously breached.',
      reason: 'common_password'
    };
  }

  if (/^(.){7,}$/.test(normalizedPassword)) {
    return {
      valid: false,
      message: 'Password is too easy to guess.',
      reason: 'repeated_characters'
    };
  }

  if ((loweredUsername && loweredUsername.length >= 4 && loweredPassword.includes(loweredUsername))
    || (loweredEmailLocalPart && loweredEmailLocalPart.length >= 4 && loweredPassword.includes(loweredEmailLocalPart))) {
    return {
      valid: false,
      message: 'Password must not include your username or email name.',
      reason: 'contains_identity'
    };
  }

  return { valid: true };
}

module.exports = {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  MIN_ADMIN_PASSWORD_LENGTH,
  validatePasswordPolicy
};
