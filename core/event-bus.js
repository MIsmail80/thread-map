/**
 * event-bus.js — Lightweight event system for ThreadMap
 *
 * Decouples the message detection layer from the UI rendering layer.
 */

class EventBus {
    constructor() {
        this.listeners = new Map();
    }

    /**
     * Subscribe to an event.
     * @param {string} eventName 
     * @param {Function} callback 
     */
    on(eventName, callback) {
        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, new Set());
        }
        this.listeners.get(eventName).add(callback);
    }

    /**
     * Unsubscribe from an event.
     * @param {string} eventName 
     * @param {Function} callback 
     */
    off(eventName, callback) {
        if (this.listeners.has(eventName)) {
            this.listeners.get(eventName).delete(callback);
            if (this.listeners.get(eventName).size === 0) {
                this.listeners.delete(eventName);
            }
        }
    }

    /**
     * Emit an event with data.
     * @param {string} eventName 
     * @param {any} data 
     */
    emit(eventName, data) {
        if (this.listeners.has(eventName)) {
            for (const callback of this.listeners.get(eventName)) {
                try {
                    callback(data);
                } catch (e) {
                    console.error(`ThreadMap EventBus: Error in listener for ${eventName}`, e);
                }
            }
        }
    }

    /**
     * Clears all listeners.
     */
    clear() {
        this.listeners.clear();
    }
}

// Global instance
window.ThreadMapEventBus = new EventBus();
