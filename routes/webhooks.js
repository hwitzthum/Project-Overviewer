'use strict';

const express = require('express');
const { URL } = require('url');
const dns = require('dns');
const net = require('net');

// Expand an IPv6 literal to 16 bytes (handles "::" compression and a trailing
// dotted IPv4 part). Returns null when the address cannot be parsed.
function ipv6ToBytes(ip) {
  let addr = ip.toLowerCase().split('%')[0];
  const dotted = addr.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const o = dotted[2].split('.').map(Number);
    addr = dotted[1] + ((o[0] << 8) | o[1]).toString(16) + ':' + ((o[2] << 8) | o[3]).toString(16);
  }
  const halves = addr.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  const bytes = [];
  for (const g of groups) {
    const v = parseInt(g, 16);
    if (Number.isNaN(v)) return null;
    bytes.push(v >> 8, v & 0xff);
  }
  return bytes.length === 16 ? bytes : null;
}

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
    const bytes = ipv6ToBytes(normalized);
    if (!bytes) return true;                                       // unparseable — block
    if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return true; // fe80::/10 link-local
    // Embedded IPv4 in any hex/dotted form: IPv4-mapped (::ffff:0:0/96),
    // IPv4-compatible (::/96) and NAT64 (64:ff9b::/96) — re-check the IPv4.
    const head10 = bytes.slice(0, 10).every((b) => b === 0);
    const embedded = bytes.slice(12).join('.');
    if (head10 && bytes[10] === 0xff && bytes[11] === 0xff && isPrivateIP(embedded)) return true;
    if (bytes.slice(0, 12).every((b) => b === 0) && isPrivateIP(embedded)) return true;
    if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b &&
        bytes.slice(4, 12).every((b) => b === 0) && isPrivateIP(embedded)) return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // ULA (fc00::/7)
    if (normalized.startsWith('ff')) return true;                  // multicast (ff00::/8)
    // IPv6-mapped IPv4 (::ffff:a.b.c.d) and IPv4-translated (::ffff:0:a.b.c.d)
    const v4mapped = normalized.match(/^::ffff:(?:0:)?(\d+\.\d+\.\d+\.\d+)$/);
    if (v4mapped && isPrivateIP(v4mapped[1])) return true;
    // Discard prefix (100::/64) — used for Teredo and similar
    if (normalized.startsWith('100::')) return true;
    // Documentation ranges (2001:db8::/32)
    if (normalized.startsWith('2001:db8:')) return true;
    // 6to4 (2002::/16): bits 17–48 encode an IPv4 address.
    // e.g. 2002:a9fe:a9fe:: embeds 169.254.169.254 (cloud metadata endpoint)
    //      2002:7f00:0001:: embeds 127.0.0.1
    //      2002:0a00:0001:: embeds 10.0.0.1
    // An attacker who controls DNS can point an AAAA record at such an address
    // to bypass the SSRF guard unless we extract and re-check the embedded IPv4.
    if (normalized.startsWith('2002:')) {
      const parts = normalized.split(':');
      const g1 = (parts[1] || '0').padStart(4, '0');
      const g2 = (parts[2] || '0').padStart(4, '0');
      const embeddedIpv4 = [
        parseInt(g1.slice(0, 2), 16),
        parseInt(g1.slice(2, 4), 16),
        parseInt(g2.slice(0, 2), 16),
        parseInt(g2.slice(2, 4), 16),
      ].join('.');
      if (isPrivateIP(embeddedIpv4)) return true;
    }
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
