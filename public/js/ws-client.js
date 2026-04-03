/**
 * WebSocket client for real-time updates.
 * Progressive enhancement — connects silently, falls back to polling on failure.
 *
 * Design: WS messages trigger an immediate polling cycle rather than
 * updating state directly. This reuses the battle-tested polling render
 * path and all its race-condition guards (isBusyWithin, pendingProjectRender).
 */
var WS = (function () {
  var socket = null;
  var reconnectDelay = 1000;
  var maxDelay = 30000;
  var reconnectTimer = null;
  var intentionalClose = false;
  var visibilityHandler = null;

  function getWsUrl() {
    var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return protocol + '//' + location.host + '/ws';
  }

  function connect() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    intentionalClose = false;

    try {
      socket = new WebSocket(getWsUrl());
    } catch (_) {
      // WebSocket not available (e.g. serverless deployment)
      return;
    }

    socket.onopen = function () {
      reconnectDelay = 1000;
      console.debug('[WS] Connected');
    };

    socket.onmessage = function (e) {
      try {
        var msg = JSON.parse(e.data);
        handleMessage(msg);
      } catch (_) {
        // Ignore malformed messages
      }
    };

    socket.onclose = function () {
      socket = null;
      if (!intentionalClose) {
        scheduleReconnect();
      }
    };

    socket.onerror = function () {
      // onclose will fire after onerror, triggering reconnect
    };
  }

  function handleMessage(msg) {
    if (!msg.event) return;

    // Any domain event triggers an immediate poll cycle
    var domainPrefixes = ['project.', 'task.', 'document.'];
    for (var i = 0; i < domainPrefixes.length; i++) {
      if (msg.event.indexOf(domainPrefixes[i]) === 0) {
        // Use the existing polling infrastructure
        if (typeof window.markSharedDataMutation === 'function') {
          window.markSharedDataMutation();
        }
        return;
      }
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      connect();
    }, reconnectDelay);
    // Exponential backoff with jitter
    reconnectDelay = Math.min(reconnectDelay * 2 + Math.random() * 500, maxDelay);
  }

  function disconnect() {
    intentionalClose = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (socket) {
      socket.close();
      socket = null;
    }
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
      visibilityHandler = null;
    }
  }

  function isConnected() {
    return socket !== null && socket.readyState === WebSocket.OPEN;
  }

  // Reconnect immediately when tab becomes visible
  visibilityHandler = function () {
    if (!document.hidden && !isConnected() && !intentionalClose) {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      reconnectDelay = 1000;
      connect();
    }
  };
  document.addEventListener('visibilitychange', visibilityHandler);

  return {
    connect: connect,
    disconnect: disconnect,
    isConnected: isConnected
  };
})();

window.WS = WS;
