/**
 * observer.js — MutationObserver and SPA navigation detection
 *
 * Responsibilities:
 *   - Watch for new user messages added to the DOM
 *   - Track seen message IDs to prevent duplicates
 *   - Debounce mutation callbacks for performance
 *   - Detect SPA route changes (ChatGPT uses client-side navigation)
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

/**
 * Primary selector for user messages.
 * ChatGPT annotates every message with a data attribute indicating the author role.
 * This is the most stable selector available — far more reliable than class names.
 */
const USER_MESSAGE_SELECTOR = '[data-message-author-role="user"]';

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
    const items = [];
    const messageElements = document.querySelectorAll(USER_MESSAGE_SELECTOR);

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
    const items = [];

    for (const node of addedNodes) {
        // Only process element nodes
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        // Check if the added node itself is a user message
        if (node.matches && node.matches(USER_MESSAGE_SELECTOR)) {
            const item = _processMessageElement(node);
            if (item) items.push(item);
        }

        // Check descendants of the added node
        if (node.querySelectorAll) {
            const descendants = node.querySelectorAll(USER_MESSAGE_SELECTOR);
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
    // Find the message ID from the element or its parent container
    const messageId = _getMessageId(el);
    if (!messageId) return null;

    // Skip already-processed messages (deduplication)
    if (seenMessageIds.has(messageId)) return null;

    // Extract text
    const firstLine = extractFirstLine(el);
    if (!firstLine) return null;

    // Mark as seen
    seenMessageIds.add(messageId);

    // Find the scrollable container (the outermost message wrapper)
    // We scroll to the parent article/div that contains the full message turn
    const scrollTarget = _findScrollTarget(el);

    return {
        id: messageId,
        label: trimLabel(firstLine),
        element: scrollTarget || el,
    };
}

/**
 * Extracts the message ID from a message element.
 *
 * Strategy:
 *   1. Check for `data-message-id` on the element itself.
 *   2. Walk up the DOM to find the nearest ancestor with `data-message-id`.
 *   3. Fallback: generate a synthetic ID from position.
 *
 * @param {HTMLElement} el
 * @returns {string|null}
 */
function _getMessageId(el) {
    // Direct attribute
    if (el.getAttribute('data-message-id')) {
        return el.getAttribute('data-message-id');
    }

    // Walk up to find a parent with the attribute
    let parent = el.parentElement;
    const maxDepth = 10; // Avoid walking too far up
    let depth = 0;

    while (parent && depth < maxDepth) {
        if (parent.getAttribute('data-message-id')) {
            return parent.getAttribute('data-message-id');
        }
        parent = parent.parentElement;
        depth++;
    }

    // Fallback: use a combination of text content hash + index
    // This handles edge cases where data-message-id isn't available
    const text = el.innerText || '';
    const hash = _simpleHash(text.slice(0, 200));
    return `synthetic-${hash}`;
}

/**
 * Finds the best scroll target for a message element.
 * Walks up the DOM to find the outermost "turn" container.
 *
 * @param {HTMLElement} el
 * @returns {HTMLElement}
 */
function _findScrollTarget(el) {
    // Look for common ChatGPT turn container patterns
    let current = el;
    let candidate = el;
    const maxDepth = 15;
    let depth = 0;

    while (current && depth < maxDepth) {
        // ChatGPT wraps each turn in an article or a div with specific attributes
        if (
            current.tagName === 'ARTICLE' ||
            current.getAttribute('data-testid')?.includes('conversation-turn')
        ) {
            candidate = current;
            break;
        }

        // Generic: if the parent still contains only this message turn, keep going
        if (current.parentElement && current.parentElement.tagName !== 'MAIN') {
            candidate = current;
        }

        current = current.parentElement;
        depth++;
    }

    return candidate;
}

/**
 * Simple string hash for generating synthetic IDs.
 * Not cryptographic — just needs to be deterministic and fast.
 *
 * @param {string} str
 * @returns {string}
 */
function _simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
}

// ──────────────────────────────────────────────
// MutationObserver
// ──────────────────────────────────────────────

/**
 * Starts observing the DOM for new user messages.
 *
 * Strategy:
 *   Instead of trying to inspect only addedNodes (which misses messages
 *   where ChatGPT adds a container first, then sets data-message-author-role
 *   as an attribute later), we do a full document re-scan on any mutation.
 *   The seenMessageIds Set prevents duplicates, and the debounce (300ms)
 *   prevents performance issues even in long chats.
 *
 * @param {Function} onNewItems — Callback receiving an array of new TOC items.
 */
function startObserving(onNewItems) {
    if (mutationObserver) return; // Already observing

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
        // Also watch for attribute changes — ChatGPT may set
        // data-message-author-role after the node is already in the DOM
        attributes: true,
        attributeFilter: ['data-message-author-role', 'data-message-id'],
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
 * Listens for SPA route changes (ChatGPT uses client-side navigation).
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
