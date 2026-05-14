'use strict';

const crypto = require('crypto');
const dns = require('dns').promises;
const http = require('http');
const https = require('https');
const { validateWebhookUrl, isPrivateIP } = require('./routes/webhooks');

/**
 * Fire-and-forget webhook dispatcher.
 * Subscribes to the EventBus and POSTs matching events to registered webhook URLs.
 * No retry logic in v1 — failures are logged and dropped.
 */
module.exports = function createWebhookDispatcher({ db, logger, eventBus }) {
  const DISPATCH_TIMEOUT_MS = 10000;

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

    // Resolve hostname → addresses and check every result
    let addresses;
    try {
      const records = await dns.lookup(hostname, { all: true });
      addresses = records.map(r => r.address);
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
        // Fire-and-forget — don't await
        safePost(
          webhook.url,
          {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-Timestamp': timestamp,
            'X-Webhook-Event': eventType
          },
          body
        ).catch(err => {
          logger.warn(
            { webhookId: webhook.id, url: webhook.url, event: eventType, err: err.message },
            'Webhook delivery failed'
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
