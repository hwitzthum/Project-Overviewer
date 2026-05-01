# Security Audit Report

**Project:** Project Overviewer
**Date:** 2026-05-01
**Auditor:** Claude Code Security Scanner
**Framework:** OWASP Top 10:2025
**Scope:** `server.js`, `routes/` (12 modules), `database.js`, `public/js/` (23 modules), `public/*.html`, `password-policy.js`, `session-config.js`, `security-events.js`, `document-security.js`, `ws-server.js`, `webhook-dispatcher.js`, `package.json`
**Technology Stack:** Node.js 24.x, Express.js 4.x, LibSQL/SQLite, Vanilla JavaScript, Helmet 8.x, bcryptjs, Zod, Pino

---

## Executive Summary

Project Overviewer is a well-structured Node.js/Express application with meaningful security controls already in place: Helmet security headers with a restrictive CSP, bcrypt password hashing (12 rounds), session tokens generated via `crypto.randomBytes()`, hashed token storage, per-IP login throttling, Zod input validation on all endpoints, user-scoped data isolation, origin-based CSRF protection, and structured security event logging. The overall security posture is above average for a self-hosted project management tool.

Six findings were identified across four OWASP categories. None are critical or high severity. Three medium findings exist: the Content Security Policy permits `'unsafe-inline'` for styles (weakening CSS injection defenses), webhooks allow `http://` URLs that transmit HMAC-signed payloads in cleartext, and the in-memory login throttle resets on every server restart or serverless cold start, weakening brute-force protection in ephemeral environments. Three low-severity defense-in-depth gaps round out the findings.

The top priority remediation items are: restricting webhook URLs to HTTPS in production, tightening the CSP by removing `'unsafe-inline'` from `style-src` (or documenting the accepted risk), and adding a `Permissions-Policy` header to reduce the browser attack surface.

**Overall Risk Score:** 18 (Moderate Risk)

| Severity | Count |
|----------|-------|
| Critical | 0     |
| High     | 0     |
| Medium   | 3     |
| Low      | 3     |
| Info     | 1     |
| **Total**| **7** |

---

## Findings

### A01:2025 — Broken Access Control

No issues identified. Checked: all route handlers for missing `requireAuth`/`requireAdmin` middleware, IDOR patterns (all data queries include `user_id` ownership filters), CORS configuration (no wildcard `Access-Control-Allow-Origin`), CSRF protection (`requireSameOriginCookieWrite` middleware enforces origin checks on state-changing cookie-authenticated requests), admin role checks, team ownership checks, and direct file read paths in `sendHtmlPage`.

---

### A02:2025 — Security Misconfiguration

#### Medium — CSP Allows `unsafe-inline` for Styles
- **File:** `server.js`
- **Line(s):** 123
- **CWE:** CWE-16: Configuration
- **Description:** The Content Security Policy includes `'unsafe-inline'` in `style-src`, which allows all inline `<style>` blocks and `style=` attributes application-wide. While the application's primary XSS defenses (HTML escaping via `escapeHtml()`, no `unsafe-inline` for scripts) are sound, `'unsafe-inline'` for styles means that if an attacker ever bypasses HTML escaping, they can inject CSS to exfiltrate data via attribute selectors or trigger redirection. It also weakens the CSP as a secondary defense layer.
- **Evidence:**
  ```js
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  ```
- **Recommendation:** Replace `'unsafe-inline'` with a per-request CSP nonce or move inline styles to external CSS classes. If inline styles are required for the dynamic theme system and modal layouts, this is an accepted risk — document it explicitly.
  ```js
  // Option A: nonce-based inline styles (requires server-side nonce injection per request)
  styleSrc: ["'self'", `'nonce-${nonce}'`, "https://fonts.googleapis.com"],

  // Option B: move all inline styles in modals.js / render.js to CSS classes
  // and remove "'unsafe-inline'" entirely

  // Option C (accepted risk): keep as-is but document that CSS injection mitigations
  // rely on escapeHtml() being applied to all user content before innerHTML assignment
  ```

#### Low — Missing `Permissions-Policy` Header
- **File:** `server.js`
- **Line(s):** 117–138
- **CWE:** CWE-16: Configuration
- **Description:** Helmet 8.x does not set a `Permissions-Policy` header by default. Without this header, the browser grants the page access to sensitive APIs (camera, microphone, geolocation, payment, etc.) — expanding the potential impact of any XSS vulnerability.
- **Evidence:**
  ```js
  app.use(helmet({
    contentSecurityPolicy: { ... }
    // No permissionsPolicy configuration
  }));
  ```
- **Recommendation:**
  ```js
  app.use(helmet({
    contentSecurityPolicy: { ... },
    permissionsPolicy: {
      features: {
        camera: [],
        microphone: [],
        geolocation: [],
        payment: [],
        usb: [],
        fullscreen: ["'self'"]
      }
    }
  }));
  ```

---

### A03:2025 — Software Supply Chain Failures

#### Low — Dependency Versions Use Caret (`^`) Ranges
- **File:** `package.json`
- **Line(s):** 19–30
- **CWE:** CWE-937: Using Components with Known Vulnerabilities
- **Description:** All production dependencies use `^` (caret) version ranges, permitting any compatible minor or patch update without explicit review. A supply chain compromise of a minor/patch release of any dependency (e.g., `express`, `@libsql/client`, `helmet`) would be automatically picked up on the next `npm install`.
- **Evidence:**
  ```json
  "dependencies": {
    "@libsql/client": "^0.17.3",
    "bcryptjs": "^3.0.3",
    "express": "^4.18.2",
    "helmet": "^8.1.0",
    ...
  }
  ```
- **Recommendation:** Pin exact versions in `package.json` and rely on `package-lock.json` for reproducible installs. Enable Dependabot (already configured in `.github/dependabot.yml`) to propose pin-update PRs with changelogs.
  ```json
  "dependencies": {
    "@libsql/client": "0.17.3",
    "bcryptjs": "3.0.3",
    "express": "4.18.2",
    ...
  }
  ```

---

### A04:2025 — Cryptographic Failures

#### Medium — Webhooks Permit Cleartext HTTP Transmission
- **File:** `routes/webhooks.js`
- **Line(s):** 42–43
- **CWE:** CWE-319: Cleartext Transmission of Sensitive Information
- **Description:** Webhook URLs can use the `http://` scheme. Webhook dispatch (`webhook-dispatcher.js`) sends HMAC-signed JSON payloads (including project/task event data and the `X-Webhook-Signature` header) over unencrypted HTTP. An attacker with network access can intercept payloads or replay captured signed requests against the receiver.
- **Evidence:**
  ```js
  // routes/webhooks.js:42-43
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return 'Only http and https URLs are allowed';
  }
  ```
- **Recommendation:** In production (`NODE_ENV === 'production'`), require `https://` webhook URLs. Allow `http://` only in development to support local testing tools.
  ```js
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return 'Only http and https URLs are allowed';
  }
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    return 'Webhook URLs must use HTTPS in production';
  }
  ```

No other cryptographic failures found. Checked: password hashing (bcrypt, 12 rounds ✅), session token generation (`crypto.randomBytes(32)` ✅), token storage (SHA-256 hashed before DB storage ✅), cookie flags (`HttpOnly`, `SameSite=Strict`, `Secure` in production ✅), no `Math.random()` for security values ✅, no MD5/SHA1 for passwords ✅.

---

### A05:2025 — Injection

No issues identified. Checked: all SQL queries use parameterized queries via LibSQL `?` placeholders (no string concatenation); all frontend `innerHTML` assignments use `escapeHtml()` on user-supplied data; no `eval()` or `Function()` calls with user input; no `child_process.exec()` with user input; no SSRF via user-controlled fetch URLs (webhook URLs validated against private IP ranges at registration and dispatch time).

---

### A06:2025 — Insecure Design

No issues identified. Checked: rate limiting on auth endpoints (`authLimiter`: 20 req/15 min), admin step-up re-authentication for destructive operations, Zod schema validation on all mutation endpoints, password complexity policy (minimum 12 chars for users, 14 for admins; common password list; username/email similarity check), project/task count limits configurable by admin, document MIME type allowlisting.

---

### A07:2025 — Authentication Failures

#### Medium — In-Memory Brute-Force Throttle Resets on Restart
- **File:** `routes/auth.js`
- **Line(s):** 26–95
- **CWE:** CWE-307: Improper Restriction of Excessive Authentication Attempts
- **Description:** The login attempt tracker (`loginAttemptTracker`) is a JavaScript `Map` held in the Node.js process's heap. Its state is lost on every process restart, crash, or serverless function cold start. An attacker can reset the per-IP/per-username throttle window by triggering a server restart or by distributing requests across multiple serverless instances. The network-level `express-rate-limit` middleware provides a second layer, but it similarly uses in-memory state by default.
- **Evidence:**
  ```js
  // routes/auth.js:26
  const loginAttemptTracker = new Map();
  ```
- **Recommendation:** For persistent deployments, the in-memory tracker is acceptable as a lightweight defense-in-depth measure. For serverless or multi-process deployments, configure `express-rate-limit` with a Redis or database store. At minimum, log a startup warning when the tracker is initialized so operators are aware.
  ```js
  // In production serverless environments, use a shared store:
  const RedisStore = require('rate-limit-redis');
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    store: new RedisStore({ client: redisClient })
  });
  ```

No other authentication failures found. Checked: session token entropy (`crypto.randomBytes(32)` ✅), session token hashing before storage ✅, constant-time dummy hash comparison on unknown users ✅, generic error messages for all auth failures ✅, session invalidation on logout and password change ✅, idle and absolute session timeouts ✅, `HttpOnly`+`SameSite=Strict` session cookies ✅, no credentials in logs ✅.

---

### A08:2025 — Software or Data Integrity Failures

#### Info — Webhook DNS Rebinding TOCTOU Gap (Documented)
- **File:** `webhook-dispatcher.js`
- **Line(s):** 66–77
- **CWE:** CWE-345: Insufficient Verification of Data Authenticity
- **Description:** The webhook dispatcher re-validates URLs at dispatch time to mitigate DNS rebinding attacks, but the code itself documents that a timing gap exists between the DNS resolution check and the actual TCP connection. A fast DNS rebind could swap the resolved IP after validation. This is a known limitation of DNS-based SSRF mitigations, acknowledged in the code.
- **Evidence:**
  ```js
  // NOTE: A TOCTOU gap exists between this DNS check and the fetch() TCP
  // connection — a fast DNS rebind could still swap the resolved IP. This
  // reduces but does not fully eliminate the attack surface.
  ```
- **Recommendation:** This is an accepted, documented limitation. To fully eliminate it, use a network-level egress firewall to block access to private/internal IP ranges, rather than relying solely on application-layer DNS checks.

No other integrity failures found. Checked: no `eval()` with user input ✅, no unsafe deserialization ✅, all HTML scripts are self-hosted (no CDN scripts without SRI) ✅, document MIME type integrity verified via magic bytes ✅, `Object.assign()` not used with `req.body` ✅.

---

### A09:2025 — Security Logging and Alerting Failures

No issues identified. Checked: security events logged for all auth events (login success/failure, registration, logout, password change, session errors), access control failures, admin operations, and data import/export. Pino structured logging is used throughout. No passwords, tokens, or session IDs appear in log output. The `fingerprintToken()` helper logs a 12-char hex prefix of token hashes for correlation without exposing the token itself. Optional file-based security log path (`SECURITY_LOG_PATH`).

---

### A10:2025 — Mishandling of Exceptional Conditions

#### Low — No Global Unhandled Promise Rejection Handler
- **File:** `server.js`
- **Line(s):** 1063–1068
- **CWE:** CWE-755: Improper Handling of Exceptional Conditions
- **Description:** The startup code registers `SIGINT` and `SIGTERM` handlers but does not register `process.on('unhandledRejection')` or `process.on('uncaughtException')` handlers. Node.js 15+ exits the process on unhandled rejections (which is safer than silently continuing), but the exit happens without structured logging or cleanup, making post-mortem debugging harder.
- **Evidence:**
  ```js
  // server.js:1056-1057 — only signal handlers, no unhandled rejection handler
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  ```
- **Recommendation:**
  ```js
  process.on('unhandledRejection', (reason, promise) => {
    logger.error({ err: reason, promise }, 'Unhandled promise rejection');
    // Node.js will exit — give logger time to flush
    process.exitCode = 1;
  });
  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception — shutting down');
    process.exit(1);
  });
  ```

No other exceptional condition issues found. Checked: all route handlers wrapped in try/catch ✅, no empty catch blocks ✅, no stack traces in API responses ✅, no fail-open patterns in auth middleware ✅, database transactions use rollback on failure ✅.

---

## Risk Score Breakdown

Scoring: Critical = 10 pts, High = 7 pts, Medium = 4 pts, Low = 2 pts, Info = 0 pts.

| Category | Critical | High | Medium | Low | Info | Points |
|----------|----------|------|--------|-----|------|--------|
| A01 — Broken Access Control        | 0 | 0 | 0 | 0 | 0 | 0  |
| A02 — Security Misconfiguration    | 0 | 0 | 1 | 1 | 0 | 6  |
| A03 — Supply Chain Failures        | 0 | 0 | 0 | 1 | 0 | 2  |
| A04 — Cryptographic Failures       | 0 | 0 | 1 | 0 | 0 | 4  |
| A05 — Injection                    | 0 | 0 | 0 | 0 | 0 | 0  |
| A06 — Insecure Design              | 0 | 0 | 0 | 0 | 0 | 0  |
| A07 — Authentication Failures      | 0 | 0 | 1 | 0 | 0 | 4  |
| A08 — Data Integrity Failures      | 0 | 0 | 0 | 0 | 1 | 0  |
| A09 — Logging & Alerting Failures  | 0 | 0 | 0 | 0 | 0 | 0  |
| A10 — Exceptional Conditions       | 0 | 0 | 0 | 1 | 0 | 2  |
| **Total**                           | 0 | 0 | 3 | 3 | 1 | **18** |

**Risk Rating:** 18 → **Moderate Risk** (11–30)

---

## Remediation Priority

1. **Require HTTPS for webhooks in production** (`routes/webhooks.js:42`) — Plaintext HTTP transmission of HMAC-signed event payloads is the most exploitable finding. A one-line environment check resolves it without breaking development workflows.

2. **Add `Permissions-Policy` header** (`server.js:117`) — Low effort, immediately reduces the browser attack surface for all users. Add via Helmet's `permissionsPolicy` option.

3. **Add `process.on('unhandledRejection')` handler** (`server.js:1056`) — Ensures unexpected async failures are logged before Node.js exits, providing visibility into production crashes.

4. **Evaluate `unsafe-inline` removal from `style-src`** (`server.js:123`) — Medium effort. Audit all inline `style=` attributes in `modals.js`/`render.js` and migrate to CSS classes. If impractical, document the accepted risk and ensure `escapeHtml()` coverage is maintained on all `innerHTML` assignments.

5. **Pin dependency versions** (`package.json`) — Run `npm ci` in CI to pin against `package-lock.json`. Consider switching `^` ranges to exact versions for production dependencies.

6. **Log a warning for ephemeral brute-force tracker in serverless** (`routes/auth.js`) — Add a startup `logger.warn` if `VERCEL === '1'` or `NODE_ENV === 'production'` to alert operators that the in-memory throttle has no persistence. For high-value deployments, wire `express-rate-limit` to a Redis store.

---

## Methodology

This audit was performed using static analysis against the OWASP Top 10:2025 framework. Each category was evaluated by reading the reference criteria, grepping the codebase for vulnerable patterns, reading flagged files to confirm findings in context, and reviewing the overall architecture. The analysis covered all server-side route handlers, middleware, database access functions, frontend JavaScript modules, HTML templates, configuration files, and dependency manifests.

**Limitations:** This is a static analysis — it does not include dynamic/runtime testing, penetration testing, or network-level analysis. Some vulnerabilities (e.g., race conditions, timing attacks in distributed deployments, logic flaws exercised only by specific data states) may only be discoverable through dynamic testing.

## References

- [OWASP Top 10:2025](https://owasp.org/Top10/2025/)
- [OWASP Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
