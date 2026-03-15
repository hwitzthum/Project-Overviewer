function parsePositiveInt(value, fallback, minimum = 1) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    return fallback;
  }
  return parsed;
}

const SESSION_TOKEN_BYTES = parsePositiveInt(process.env.SESSION_TOKEN_BYTES, 32, 16);
const SESSION_ABSOLUTE_TIMEOUT_MS = parsePositiveInt(
  process.env.SESSION_ABSOLUTE_TIMEOUT_MS,
  24 * 60 * 60 * 1000,
  60 * 1000
);
const SESSION_IDLE_TIMEOUT_MS = parsePositiveInt(
  process.env.SESSION_IDLE_TIMEOUT_MS,
  30 * 60 * 1000,
  60 * 1000
);
const SESSION_TOUCH_INTERVAL_MS = parsePositiveInt(
  process.env.SESSION_TOUCH_INTERVAL_MS,
  60 * 1000,
  1000
);

module.exports = {
  SESSION_TOKEN_BYTES,
  SESSION_ABSOLUTE_TIMEOUT_MS,
  SESSION_ABSOLUTE_TIMEOUT_SECONDS: Math.ceil(SESSION_ABSOLUTE_TIMEOUT_MS / 1000),
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_TOUCH_INTERVAL_MS
};
