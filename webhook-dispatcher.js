'use strict';

const crypto = require('crypto');
const dns = require('dns').promises;
const http = require('http');
const https = require('https');
const { validateWebhookUrl, isPrivateIP } = require('./routes/webhooks');

/**
 * Fire-and-forget webhook dispatcher with automatic retry.
 * Subscribes to the EventBus and POSTs matching events to registered webhook URLs.
 * Failed deliveries are retried up to MAX_DELIVERY_ATTEMPTS times with exponential backoff.
 */
module.exports = function createWebhookDispatcher({ db, logger, eventBus }) {
  const DISPATCH_TIMEOUT_MS = 10000;
  const MAX_DELIVERY_ATTEMPTS = 3;
  const RETRY_BASE_DELAY_MS = 2000;

  function signPayload(body, secret, timestamp) {
    const hmac = crypto.createHmac('sha256', secret);
    // Include timestamp in signed data to prevent replay attacks.
    // Receivers should reject requests where the timestamp is stale (>5 min).
    hmac.update(`${timestamp}.${body}`);
    return `sha256=${hmac.digest('hex')}`;
  }

  function matchesEvent(webhookEvents, eventType) {
    let events;
    try {
      events = typeof webhookEvents === 'string'
        ? JSON.parse(webhookEvents)
        : webhookEvents;
    } catch { return false; }
    if (!Array.isArray(events)) return false;
    if (events.includes('*')) return true;
    if (events.includes(eventType)) return true;
    // Match category wildcards like "task.*"
    const category = eventType.split('.')[0];
    return events.includes(`${category}.*`);
  }

  /**
   * Resolve hostname → IP, verify against private-range blocklist, then POST
   * directly to the resolved IP with the original Host header.  This closes
   * the TOCTOU window that exists when validateWebhookUrl() and fetch() are
   * separated by even a few milliseconds: a fast DNS rebind cannot swap the
   * address between our check and the actual TCP connection.
   */
  async function safePost(urlString, headers, body) {
    const parsedUrl = new URL(urlString);
    const hostname = parsedUrl.hostname;
    const isHttps = parsedUrl.protocol === 'https:';
    const port = parsedUrl.port
      ? Number(parsedUrl.port)
      : (isHttps ? 443 : 80);

    // Resolve hostname → addresses using the same pure-DNS path as registration
    // time (routes/webhooks.js).  dns.lookup() uses getaddrinfo() which consults
    // /etc/hosts and NSS — an attacker could pre-stage a local hosts entry, or
    // a fast DNS rebind between registration and dispatch could swap the address.
    // resolve4/resolve6 bypass those OS layers and go straight to the DNS resolver.
    let addresses;
    try {
      const [v4result, v6result] = await Promise.allSettled([
        dns.resolve4(hostname),
        dns.resolve6(hostname),
      ]);
      const v4addrs = v4result.status === 'fulfilled' ? v4result.value : [];
      const v6addrs = v6result.status === 'fulfilled' ? v6result.value : [];
      addresses = [...v4addrs, ...v6addrs];
    } catch (err) {
      throw new Error(`DNS resolution failed for ${hostname}: ${err.message}`);
    }

    if (addresses.length === 0) {
      throw new Error(`No DNS records found for ${hostname}`);
    }

    for (const ip of addresses) {
      // isPrivateIP is exported from routes/webhooks — same blocklist used
      // at registration time so we stay consistent.
      if (isPrivateIP(ip)) {
        throw new Error(`Resolved IP ${ip} for ${hostname} is in a private/reserved range`);
      }
    }

    // Use the first resolved (public) address for the actual connection
    const resolvedIp = addresses[0];

    // Build the target path+query
    const targetPath = parsedUrl.pathname + parsedUrl.search;

    return new Promise((resolve, reject) => {
      const transport = isHttps ? https : http;
      const req = transport.request(
        {
          // Connect directly to the resolved IP — bypasses DNS entirely
          host: resolvedIp,
          port,
          path: targetPath,
          method: 'POST',
          headers: {
            // Preserve the original Host so the server-side virtual-hosting works
            Host: hostname,
            ...headers
          },
          // Enforce a strict wall-clock deadline
          timeout: DISPATCH_TIMEOUT_MS
        },
        (res) => {
          // Drain response so the socket is released
          res.resume();
          resolve(res.statusCode);
        }
      );

      req.on('timeout', () => {
        req.destroy(new Error('Webhook request timed out'));
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  /**
   * Deliver a webhook payload with exponential-backoff retries.
   * Attempts: 1 (immediate), 2 (after 2 s), 3 (after 4 s).
   * Non-2xx HTTP responses are treated as failures and retried.
   */
  async function deliverWithRetry(webhookId, url, headers, body, eventType) {
    for (let attempt = 1; attempt <= MAX_DELIVERY_ATTEMPTS; attempt++) {
      try {
        const status = await safePost(url, headers, body);
        if (status >= 200 && status < 300) return; // success
        logger.warn(
          { webhookId, url, event: eventType, status, attempt, maxAttempts: MAX_DELIVERY_ATTEMPTS },
          'Webhook returned non-2xx, retrying'
        );
      } catch (err) {
        logger.warn(
          { webhookId, url, event: eventType, err: err.message, attempt, maxAttempts: MAX_DELIVERY_ATTEMPTS },
          'Webhook delivery error, retrying'
        );
      }
      if (attempt < MAX_DELIVERY_ATTEMPTS) {
        await new Promise(r => setTimeout(r, RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1)));
      }
    }
    logger.warn(
      { webhookId, url, event: eventType, maxAttempts: MAX_DELIVERY_ATTEMPTS },
      'Webhook delivery gave up after max retries'
    );
  }

  async function dispatch(eventType, payload) {
    try {
      const userId = payload.userId;
      if (!userId) return;

      const webhooks = await db.getActiveWebhooksForUser(userId);
      if (!webhooks || webhooks.length === 0) return;

      for (const webhook of webhooks) {
        if (!matchesEvent(webhook.events, eventType)) continue;

        // Allowlist payload fields to avoid leaking internal data
        const safeData = {
          projectId: payload.projectId,
          taskId: payload.taskId,
          documentId: payload.documentId,
          title: payload.title,
          changes: payload.changes
        };
        // Remove undefined keys
        Object.keys(safeData).forEach(k => safeData[k] === undefined && delete safeData[k]);

        const timestamp = String(Math.floor(Date.now() / 1000));
        const body = JSON.stringify({
          event: eventType,
          timestamp: new Date().toISOString(),
          data: safeData
        });

        // Step 1: allowlist/format validation (scheme, port, etc.)
        const ssrfError = await validateWebhookUrl(webhook.url);
        if (ssrfError) {
          logger.warn(
            { webhookId: webhook.id, url: webhook.url, reason: ssrfError },
            'Webhook dispatch blocked by SSRF validation'
          );
          continue;
        }

        const signature = signPayload(body, webhook.secret, timestamp);

        // Step 2 + 3: resolve hostname → verify IP → connect to IP directly.
        // This eliminates the TOCTOU gap: there is no separate fetch() call
        // that could be redirected by a DNS rebind after our validation.
        // Fire-and-forget — don't await; retries happen inside deliverWithRetry.
        deliverWithRetry(
          webhook.id,
          webhook.url,
          {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-Timestamp': timestamp,
            'X-Webhook-Event': eventType
          },
          body,
          eventType
        ).catch(err => {
          logger.error(
            { webhookId: webhook.id, err: err.message },
            'Unexpected error in webhook delivery loop'
          );
        });
      }
    } catch (err) {
      logger.error({ err: err.message, eventType }, 'Webhook dispatch error');
    }
  }

  function init() {
    eventBus.on('*', (eventType, payload) => {
      dispatch(eventType, payload);
    });
    logger.info('Webhook dispatcher initialized');
  }

  return { init, dispatch };
};
