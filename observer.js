/**
 * observer.js — MutationObserver and SPA navigation detection
 *
 * Responsibilities:
 *   - Watch for new user messages added to the DOM
 *   - Track seen message IDs to prevent duplicates
 *   - Debounce mutation callbacks for performance
 *   - Detect SPA route changes (all platforms use client-side navigation)
 *
 * Platform-specific DOM logic is delegated to platform adapters.
 *
 * PRIVACY: No data leaves the browser. All processing is local.
 */

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

/** Debounce delay (ms) for mutation observer callbacks */
const OBSERVER_DEBOUNCE_MS = 150;

/** Interval (ms) to poll for URL changes (SPA fallback) */
const URL_POLL_INTERVAL_MS = 500;

// ──────────────────────────────────────────────
// Module State
// ──────────────────────────────────────────────

/** @type {MutationObserver|null} */
let mutationObserver = null;

/** @type {Set<string>} Set of already-processed message IDs */
let seenMessageIds = new Set();

/** @type {string|null} Last known URL for SPA change detection */
let lastKnownUrl = null;

/** @type {number|null} URL polling timer ID */
let urlPollTimer = null;

/** @type {Function|null} Bound popstate handler for cleanup */
let popstateHandler = null;

/** @type {Object|null} Current platform adapter — set by content.js */
let _platform = null;

// ──────────────────────────────────────────────
// Platform Adapter
// ──────────────────────────────────────────────

/**
 * Sets the platform adapter for the observer to use.
 * Must be called before scanAllUserMessages() or startObserving().
 *
 * @param {Object} platform — The platform adapter object.
 */
function setObserverPlatform(platform) {
    _platform = platform;
}

// ──────────────────────────────────────────────
// Message Scanning
// ──────────────────────────────────────────────

/**
 * Scans the entire document for user messages and returns TOC items
 * for any not yet seen. Updates the seenMessageIds set.
 *
 * @returns {Array<{id: string, label: string, element: HTMLElement}>}
 *   Array of new TOC items found.
 */
function scanAllUserMessages() {
    if (!_platform) return [];

    const items = [];
    const messageElements = _platform.getUserMessages();

    for (const el of messageElements) {
        const item = _processMessageElement(el);
        if (item) {
            items.push(item);
        }
    }

    return items;
}

/**
 * Scans a specific subtree (set of added nodes) for new user messages.
 * Used by the MutationObserver callback for incremental updates.
 *
 * @param {NodeList|Array<Node>} addedNodes — Nodes added to the DOM.
 * @returns {Array<{id: string, label: string, element: HTMLElement}>}
 */
function _scanAddedNodes(addedNodes) {
    if (!_platform) return [];

    const selector = _platform.getUserMessageSelector();
    const items = [];

    for (const node of addedNodes) {
        // Only process element nodes
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        // Check if the added node itself is a user message
        if (node.matches && node.matches(selector)) {
            const item = _processMessageElement(node);
            if (item) items.push(item);
        }

        // Check descendants of the added node
        if (node.querySelectorAll) {
            const descendants = node.querySelectorAll(selector);
            for (const desc of descendants) {
                const item = _processMessageElement(desc);
                if (item) items.push(item);
            }
        }
    }

    return items;
}

/**
 * Processes a single message element into a TOC item.
 * Returns null if the message was already seen or has no extractable text.
 *
 * @param {HTMLElement} el — The message element.
 * @returns {{id: string, label: string, element: HTMLElement}|null}
 */
function _processMessageElement(el) {
    if (!_platform) return null;

    // Find the message ID using the platform adapter
    const messageId = _platform.getMessageId(el);
    if (!messageId) return null;

    // Skip already-processed messages (deduplication)
    if (seenMessageIds.has(messageId)) return null;

    // Extract text using the platform adapter
    const firstLine = _platform.getMessageText(el);
    if (!firstLine) return null;

    // Mark as seen
    seenMessageIds.add(messageId);

    // Find the scrollable container using the platform adapter
    const scrollTarget = _platform.getScrollTarget(el);

    return {
        id: messageId,
        label: trimLabel(firstLine),
        element: scrollTarget || el,
    };
}

// ──────────────────────────────────────────────
// MutationObserver
// ──────────────────────────────────────────────

/**
 * Starts observing the DOM for new user messages.
 *
 * Strategy:
 *   Instead of trying to inspect only addedNodes (which misses messages
 *   where the platform adds a container first, then sets role attributes
 *   later), we do a full document re-scan on any mutation.
 *   The seenMessageIds Set prevents duplicates, and the debounce (300ms)
 *   prevents performance issues even in long chats.
 *
 * @param {Function} onNewItems — Callback receiving an array of new TOC items.
 */
function startObserving(onNewItems) {
    if (mutationObserver) return; // Already observing
    if (!_platform) return;

    // Debounced full re-scan: on any DOM change, look for unseen user messages 
    const debouncedRescan = debounce(() => {
        const newItems = scanAllUserMessages();
        if (newItems.length > 0) {
            onNewItems(newItems);
        }
    }, 300);

    mutationObserver = new MutationObserver(() => {
        debouncedRescan();
    });

    mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        // Also watch for attribute changes — platforms may set
        // role/ID attributes after the node is already in the DOM
        attributes: true,
        attributeFilter: _platform.getObservedAttributes(),
    });
}

/**
 * Stops the MutationObserver.
 */
function stopObserving() {
    if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
    }
}

// ──────────────────────────────────────────────
// SPA Navigation Detection
// ──────────────────────────────────────────────

/**
 * Listens for SPA route changes (all platforms use client-side navigation).
 *
 * Strategy:
 *   1. Listen to `popstate` events (browser back/forward).
 *   2. Poll URL at a short interval (catches pushState-based navigation
 *      that doesn't trigger popstate).
 *
 * @param {Function} onNavigate — Callback invoked with the new URL path.
 */
function listenForNavigation(onNavigate) {
    lastKnownUrl = window.location.href;

    // Handler for popstate events
    popstateHandler = () => {
        const newUrl = window.location.href;
        if (newUrl !== lastKnownUrl) {
            lastKnownUrl = newUrl;
            onNavigate(newUrl);
        }
    };

    window.addEventListener('popstate', popstateHandler);

    // Poll for URL changes (catches pushState)
    urlPollTimer = setInterval(() => {
        const currentUrl = window.location.href;
        if (currentUrl !== lastKnownUrl) {
            lastKnownUrl = currentUrl;
            onNavigate(currentUrl);
        }
    }, URL_POLL_INTERVAL_MS);
}

/**
 * Stops listening for navigation changes.
 */
function stopListeningForNavigation() {
    if (popstateHandler) {
        window.removeEventListener('popstate', popstateHandler);
        popstateHandler = null;
    }

    if (urlPollTimer) {
        clearInterval(urlPollTimer);
        urlPollTimer = null;
    }
}

/**
 * Resets the seen message IDs set.
 * Called when navigating to a new chat.
 */
function resetSeenMessages() {
    seenMessageIds.clear();
}
