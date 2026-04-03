'use strict';

const { WebSocketServer } = require('ws');

/**
 * WebSocket server for real-time updates.
 * Progressive enhancement — only activated when running as persistent Node server
 * (not on Vercel serverless).
 *
 * Clients receive "something changed" notifications and trigger a poll
 * to fetch fresh data via the existing REST API. This avoids duplicating
 * rendering/state logic over WebSocket.
 */
module.exports = function createWebSocketServer({ server, db, logger, eventBus, logSecurityEvent }) {
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Map(); // ws → { userId, alive }

  // Parse session token from cookie header
  function parseSessionCookie(cookieHeader) {
    if (!cookieHeader) return null;
    const match = cookieHeader.match(/(?:^|;\s*)session_token=([^\s;]+)/);
    return match ? match[1] : null;
  }

  // Authenticate WebSocket upgrade requests
  server.on('upgrade', async (request, socket, head) => {
    try {
      // Only handle /ws path
      const url = new URL(request.url, `http://${request.headers.host}`);
      if (url.pathname !== '/ws') {
        socket.destroy();
        return;
      }

      // Extract session token from cookie or Authorization header
      const token = parseSessionCookie(request.headers.cookie)
        || (request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : null);
      if (!token) {
        if (logSecurityEvent) {
          logSecurityEvent('auth.websocket.rejected', {
            req: request,
            statusCode: 401,
            reason: 'missing_token',
            severity: 'medium'
          });
        }
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      // Validate session — pass raw token; getSessionByToken hashes internally
      const sessionLookup = await db.getSessionByToken(token);
      if (sessionLookup.status !== 'ok' || !sessionLookup.session) {
        if (logSecurityEvent) {
          logSecurityEvent('auth.websocket.rejected', {
            req: request,
            statusCode: 401,
            reason: sessionLookup.status || 'invalid_session',
            severity: 'medium'
          });
        }
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const session = sessionLookup.session;

      // Accept the connection
      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.userId = session.userId;
        ws.sessionId = session.sessionId;
        wss.emit('connection', ws, request);
      });
    } catch (err) {
      logger.error({ err: err.message }, 'WebSocket upgrade failed');
      socket.destroy();
    }
  });

  // Track connected clients with team membership for scoped broadcasts
  wss.on('connection', async (ws) => {
    let teamUserIds = [ws.userId];
    try {
      teamUserIds = await db.getTeamUserIds(ws.userId);
    } catch (_) { /* default to self only */ }
    clients.set(ws, { userId: ws.userId, teamUserIds, alive: true });
    logger.debug({ userId: ws.userId }, 'WebSocket client connected');

    ws.on('pong', () => {
      const info = clients.get(ws);
      if (info) info.alive = true;
    });

    ws.on('close', () => {
      clients.delete(ws);
      logger.debug({ userId: ws.userId }, 'WebSocket client disconnected');
    });

    ws.on('error', () => {
      clients.delete(ws);
    });
  });

  // Broadcast domain events to connected clients (scoped to actor + teammates)
  eventBus.on('*', (eventType, payload) => {
    if (clients.size === 0) return;
    const eventUserId = payload?.userId;
    if (!eventUserId) return; // system events without a user context are not broadcast

    const message = JSON.stringify({
      event: eventType,
      timestamp: new Date().toISOString()
    });

    for (const [ws, info] of clients) {
      if (ws.readyState !== ws.OPEN) continue;
      // Only notify the actor and their teammates
      if (info.userId === eventUserId || info.teamUserIds?.includes(eventUserId)) {
        try {
          ws.send(message);
        } catch (_) {
          // Ignore send errors — client will be cleaned up by heartbeat
        }
      }
    }
  });

  // Heartbeat — terminate dead connections every 30s
  const heartbeatInterval = setInterval(() => {
    for (const [ws, info] of clients) {
      if (!info.alive) {
        clients.delete(ws);
        ws.terminate();
        continue;
      }
      info.alive = false;
      ws.ping();
    }
  }, 30000);

  // Cleanup on server close
  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  logger.info('WebSocket server initialized on /ws');
  return wss;
};
