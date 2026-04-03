'use strict';

const crypto = require('crypto');
const { validateWebhookUrl } = require('./routes/webhooks');

/**
 * Fire-and-forget webhook dispatcher.
 * Subscribes to the EventBus and POSTs matching events to registered webhook URLs.
 * No retry logic in v1 — failures are logged and dropped.
 */
module.exports = function createWebhookDispatcher({ db, logger, eventBus }) {
  const DISPATCH_TIMEOUT_MS = 10000;

  function signPayload(body, secret) {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(body);
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

        const body = JSON.stringify({
          event: eventType,
          timestamp: new Date().toISOString(),
          data: safeData
        });

        // Re-validate URL at dispatch time to mitigate DNS rebinding attacks.
        // NOTE: A TOCTOU gap exists between this DNS check and the fetch() TCP
        // connection — a fast DNS rebind could still swap the resolved IP. This
        // reduces but does not fully eliminate the attack surface.
        const ssrfError = await validateWebhookUrl(webhook.url);
        if (ssrfError) {
          logger.warn(
            { webhookId: webhook.id, url: webhook.url, reason: ssrfError },
            'Webhook dispatch blocked by SSRF re-validation'
          );
          continue;
        }

        const signature = signPayload(body, webhook.secret);

        // Fire-and-forget — don't await
        fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-Event': eventType
          },
          body,
          signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS)
        }).catch(err => {
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
