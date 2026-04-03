'use strict';

/**
 * Minimal in-process event bus for domain events.
 * Handlers are invoked synchronously; async work (e.g. webhook dispatch)
 * should be queued inside the handler, not awaited.
 */
class EventBus {
  constructor() {
    this._handlers = new Map();   // eventType → Set<handler>
    this._wildcards = new Set();  // handlers subscribed to '*'
  }

  /**
   * Subscribe to a specific event type, or '*' for all events.
   * Returns an unsubscribe function.
   */
  on(eventType, handler) {
    if (eventType === '*') {
      this._wildcards.add(handler);
      return () => this._wildcards.delete(handler);
    }
    if (!this._handlers.has(eventType)) {
      this._handlers.set(eventType, new Set());
    }
    this._handlers.get(eventType).add(handler);
    return () => {
      const set = this._handlers.get(eventType);
      if (set) {
        set.delete(handler);
        if (set.size === 0) this._handlers.delete(eventType);
      }
    };
  }

  off(eventType, handler) {
    if (eventType === '*') {
      this._wildcards.delete(handler);
      return;
    }
    const set = this._handlers.get(eventType);
    if (set) {
      set.delete(handler);
      if (set.size === 0) this._handlers.delete(eventType);
    }
  }

  /**
   * Emit an event. Specific handlers fire first, then wildcards.
   * Errors in handlers are caught and logged to prevent one handler
   * from breaking others.
   */
  emit(eventType, payload) {
    const specific = this._handlers.get(eventType);
    if (specific) {
      for (const handler of specific) {
        try { handler(eventType, payload); } catch (err) { console.error(`EventBus handler error for "${eventType}":`, err); }
      }
    }
    for (const handler of this._wildcards) {
      try { handler(eventType, payload); } catch (err) { console.error(`EventBus wildcard handler error for "${eventType}":`, err); }
    }
  }
}

module.exports = new EventBus();
