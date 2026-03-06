/**
 * message-stream.js — Event-Based Message Stream
 *
 * Instead of scanning the entire DOM repeatedly, this module hooks into the 
 * optimized MutationObserver and processes the detection pipeline on added nodes.
 * It manages the stream of new canonical messages and emits them via the Event Bus.
 */

window.ThreadMapMessageStream = {
    _seenMessageIds: new Set(),
    _platformAdapter: null,

    /**
     * Initialize the message stream with the current platform adapter.
     * @param {Object} platformAdapter 
     */
    init(platformAdapter) {
        this._platformAdapter = platformAdapter;
        this.reset();
    },

    /**
     * Process an array of potential message candidate nodes (passed from observer).
     * @param {HTMLElement[]} nodes 
     */
    processNodes(nodes) {
        if (!this._platformAdapter) return;

        // The platform adapter is responsible for running the detection strategies
        // on these nodes (or globally if full scan) and returning normalized models.
        // For processing specific nodes, we call a targeted function on the adapter if available.
        const normalizedMessages = this._platformAdapter.processAddedNodes(nodes);

        for (const message of normalizedMessages) {
            this._handleNewMessage(message);
        }
    },

    /**
     * Perform a full rescan to bootstrap initial messages or handle aggressive DOM resets.
     */
    fullRescan() {
        if (!this._platformAdapter || !this._platformAdapter.getUserMessages) return;

        const rawElements = this._platformAdapter.getUserMessages();
        const normalizedMessages = rawElements
            .map(el => window.ThreadMapMessageNormalizer.normalize(el, this._platformAdapter, "user"))
            .filter(msg => msg !== null);

        for (const message of normalizedMessages) {
            this._handleNewMessage(message);
        }
    },

    /**
     * Internal handler to check deduplication and emit the event.
     * @param {MessageModel} message 
     */
    _handleNewMessage(message) {
        if (!this._seenMessageIds.has(message.id)) {
            this._seenMessageIds.add(message.id);
            window.ThreadMapEventBus.emit("message-added", message);
        }
    },

    /**
     * Reset the stream state (e.g. on navigation).
     */
    reset() {
        this._seenMessageIds.clear();
    }
};
