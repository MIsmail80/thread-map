/**
 * optimized-observer.js — Targeted MutationObserver
 *
 * Replaces the full document rescan observer.
 * Watches only the chat container's childList for insertions.
 * Emits added nodes to the Message Stream.
 */

window.ThreadMapObserver = {
    _observer: null,
    _platformAdapter: null,
    _fallbackTimerId: null,

    /**
     * Start observing the chat container.
     */
    start(platformAdapter) {
        if (this._observer) this.stop();
        this._platformAdapter = platformAdapter;

        const container = platformAdapter.getRootContainer();
        if (!container) {
            console.warn("ThreadMap: Cannot find root container to observe.");
            return;
        }

        let accumulatedNodes = [];

        const processAccumulated = () => {
            if (window.ThreadMapMessageStream && accumulatedNodes.length > 0) {
                const nodesToProcess = [...accumulatedNodes];
                accumulatedNodes = [];
                window.ThreadMapMessageStream.processNodes(nodesToProcess);
            }
        };

        const debounceProcess = (typeof debounce === 'function')
            ? debounce(processAccumulated, 250)
            : processAccumulated;

        this._observer = new MutationObserver((mutations) => {
            let hasAdded = false;
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
                            accumulatedNodes.push(node);
                            hasAdded = true;
                        }
                    }
                }
            }

            if (hasAdded) {
                // Clear any fallback timers since we see activity
                this._clearFallbackTimer();
                debounceProcess();
            }
        });

        this._observer.observe(container, {
            childList: true,
            subtree: true // Necessary because platforms nest messages deep inside the root container
        });

        // Start a fallback timer to detect complete breakage
        this._startFallbackTimer();
    },

    stop() {
        if (this._observer) {
            this._observer.disconnect();
            this._observer = null;
        }
        this._clearFallbackTimer();
        this._platformAdapter = null;
    },

    _startFallbackTimer() {
        if (this._fallbackTimerId) return;
        this._clearFallbackTimer();

        // If no messages are processed within 10 seconds of starting the observer,
        // and there are zero messages in the stream, warn.
        this._fallbackTimerId = setTimeout(() => {
            if (window.ThreadMapMessageStream && window.ThreadMapMessageStream._seenMessageIds.size === 0) {
                console.warn("ThreadMap: message detection failed. The DOM may have changed or the conversation is empty.");
                // Optionally emit a diagnostic event here
                if (window.ThreadMapEventBus) {
                    window.ThreadMapEventBus.emit("diagnostic", { type: 'detection_failed' });
                }
            }
        }, 10000);
    },

    _clearFallbackTimer() {
        if (this._fallbackTimerId) {
            clearTimeout(this._fallbackTimerId);
            this._fallbackTimerId = null;
        }
    }
};
