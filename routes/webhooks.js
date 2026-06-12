'use strict';

const express = require('express');
const { URL } = require('url');
const dns = require('dns');
const net = require('net');

function isPrivateIP(ip) {
  // IPv4 private/reserved ranges
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 0) return true;                               // 0.0.0.0/8 (this host)
    if (parts[0] === 10) return true;                              // 10.0.0.0/8 (private)
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true; // 100.64.0.0/10 (CGNAT)
    if (parts[0] === 127) return true;                             // 127.0.0.0/8 (loopback)
    if (parts[0] === 169 && parts[1] === 254) return true;        // 169.254.0.0/16 (link-local / cloud metadata)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12 (private)
    if (parts[0] === 192 && parts[1] === 0 && parts[2] === 0) return true;  // 192.0.0.0/24 (IETF Protocol Assignments)
    if (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) return true;  // 192.0.2.0/24 (TEST-NET-1, documentation)
    if (parts[0] === 192 && parts[1] === 168) return true;        // 192.168.0.0/16 (private)
    if (parts[0] === 198 && parts[1] >= 18 && parts[1] <= 19) return true;  // 198.18.0.0/15 (benchmark testing)
    if (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) return true; // 198.51.100.0/24 (TEST-NET-2, documentation)
    if (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) return true;  // 203.0.113.0/24 (TEST-NET-3, documentation)
    if (parts[0] >= 224 && parts[0] <= 239) return true;          // 224.0.0.0/4 (multicast)
    if (parts[0] >= 240) return true;                              // 240.0.0.0/4 (reserved/future use) + 255.255.255.255
    return false;
  }
  // IPv6 loopback, link-local, ULA, multicast, and IPv6-mapped IPv4
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === '::' || normalized === '::1') return true;  // unspecified + loopback
    if (normalized.startsWith('fe80:')) return true;               // link-local
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // ULA (fc00::/7)
    if (normalized.startsWith('ff')) return true;                  // multicast (ff00::/8)
    // IPv6-mapped IPv4 (::ffff:a.b.c.d) and IPv4-translated (::ffff:0:a.b.c.d)
    const v4mapped = normalized.match(/^::ffff:(?:0:)?(\d+\.\d+\.\d+\.\d+)$/);
    if (v4mapped && isPrivateIP(v4mapped[1])) return true;
    // Discard prefix (100::/64) — used for Teredo and similar
    if (normalized.startsWith('100::')) return true;
    // Documentation ranges (2001:db8::/32)
    if (normalized.startsWith('2001:db8:')) return true;
    return false;
  }
  // Unknown address family — block by default
  return true;
}

async function validateWebhookUrl(urlStr) {
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    return 'Invalid URL';
  }
  // Only allow http/https; production requires https to prevent cleartext transmission
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return 'Only http and https URLs are allowed';
  }
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    return 'Webhook URLs must use HTTPS in production';
  }
  // Block localhost hostnames
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') {
    return 'Localhost URLs are not allowed';
  }
  // Reject IPv6 zone IDs (e.g. fe80::1%eth0): net.isIP() strips the scope
  // suffix before checking, which would bypass the fe80:: link-local guard.
  if (hostname.includes('%')) return 'IPv6 zone IDs are not allowed';

  // If hostname is already an IP, check directly
  if (net.isIP(hostname)) {
    if (isPrivateIP(hostname)) return 'Private/internal IP addresses are not allowed';
    return null;
  }
  // Resolve hostname and check all IPs
  try {
    const addresses = await dns.promises.resolve4(hostname).catch(() => []);
    const addresses6 = await dns.promises.resolve6(hostname).catch(() => []);
    const allAddresses = [...addresses, ...addresses6];
    if (allAddresses.length === 0) return 'Could not resolve hostname';
    for (const addr of allAddresses) {
      if (isPrivateIP(addr)) return 'URL resolves to a private/internal IP address';
    }
  } catch {
    return 'Could not resolve hostname';
  }
  return null;
}

module.exports = function createWebhooksRouter({ db, logger, schemas, requireAuth }) {
  const router = express.Router();

  // GET / — list user's webhooks (secret fully redacted)
  router.get('/', requireAuth, async (req, res) => {
    try {
      const webhooks = await db.getWebhooksByUser(req.user.userId);
      // Redact secrets in list response: show only a fixed placeholder so that
      // no portion of the secret value (not even the last 4 chars) is disclosed
      // to the client. The full secret is only needed by the receiving endpoint.
      const safe = webhooks.map(w => ({
        ...w,
        secret: w.secret ? '****' : undefined
      }));
      res.json(safe);
    } catch (error) {
      logger.error({ err: error }, 'Error listing webhooks');
      res.status(500).json({ error: 'Failed to list webhooks' });
    }
  });

  // POST / — create webhook
  router.post('/', requireAuth, async (req, res) => {
    try {
      const result = schemas.createWebhook.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid input', details: result.error.issues });
      }

      const ssrfError = await validateWebhookUrl(req.body.url);
      if (ssrfError) {
        return res.status(400).json({ error: ssrfError });
      }

      const webhook = await db.createWebhook(req.user.userId, req.body);
      res.status(201).json(webhook);
    } catch (error) {
      if (error.code === 'WEBHOOK_LIMIT_EXCEEDED') {
        return res.status(400).json({ error: error.message });
      }
      logger.error({ err: error }, 'Error creating webhook');
      res.status(500).json({ error: 'Failed to create webhook' });
    }
  });

  // PUT /:id — update webhook
  router.put('/:id', requireAuth, async (req, res) => {
    try {
      const result = schemas.updateWebhook.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid input', details: result.error.issues });
      }

      if (req.body.url) {
        const ssrfError = await validateWebhookUrl(req.body.url);
        if (ssrfError) {
          return res.status(400).json({ error: ssrfError });
        }
      }

      const updated = await db.updateWebhook(req.params.id, req.user.userId, req.body);
      if (!updated) {
        return res.status(404).json({ error: 'Webhook not found' });
      }
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, 'Error updating webhook');
      res.status(500).json({ error: 'Failed to update webhook' });
    }
  });

  // DELETE /:id — delete webhook
  router.delete('/:id', requireAuth, async (req, res) => {
    try {
      const deleted = await db.deleteWebhook(req.params.id, req.user.userId);
      if (!deleted) {
        return res.status(404).json({ error: 'Webhook not found' });
      }
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, 'Error deleting webhook');
      res.status(500).json({ error: 'Failed to delete webhook' });
    }
  });

  return router;
};

// Export validation functions for reuse (e.g., dispatch-time SSRF re-check)
module.exports.validateWebhookUrl = validateWebhookUrl;
module.exports.isPrivateIP = isPrivateIP;
