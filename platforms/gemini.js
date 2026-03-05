/**
 * gemini.js — Gemini platform adapter for ThreadMap
 *
 * Handles all Gemini-specific DOM interactions:
 *   - Finding user messages (user-query elements)
 *   - Extracting message text and IDs
 *   - Determining scroll targets
 *   - Extracting chat IDs from URL
 *
 * Gemini's DOM structure uses custom web components.
 * User queries are wrapped in elements with specific markers.
 *
 * PRIVACY: No data leaves the browser. All processing is local.
 */

// ──────────────────────────────────────────────
// Platform Registration
// ──────────────────────────────────────────────

window.ThreadMapPlatforms = window.ThreadMapPlatforms || {};

window.ThreadMapPlatforms.gemini = {
    name: 'Gemini',

    /**
     * Returns all user message elements in the current conversation.
     *
     * Gemini uses various selectors for user queries:
     *   - .query-text elements inside user turns
     *   - [data-message-author="user"] style attributes
     *   - Custom elements with user query content
     *
     * We try multiple strategies to find user messages.
     *
     * @returns {NodeList|Array<HTMLElement>}
     */
    getUserMessages() {
        // Strategy 1: User query content containers
        let messages = document.querySelectorAll('.query-text');
        if (messages.length > 0) return messages;

        // Strategy 2: User turns identified by role attribute
        messages = document.querySelectorAll('[data-message-author="user"]');
        if (messages.length > 0) return messages;

        // Strategy 3: Gemini conversation turn containers with user content
        // Gemini often wraps user queries in specific turn containers
        messages = document.querySelectorAll('user-query, [data-user-query]');
        if (messages.length > 0) return messages;

        // Strategy 4: Look for message-content elements inside user turns
        messages = document.querySelectorAll('.user-query-content, .query-content');
        if (messages.length > 0) return messages;

        // Strategy 5: Conversation turns with user role indicators
        messages = document.querySelectorAll('[data-turn-role="user"], [data-role="user"]');
        if (messages.length > 0) return messages;

        return [];
    },

    /**
     * Extracts the visible text content from a message element.
     *
     * @param {HTMLElement} el — The message element.
     * @returns {string|null}
     */
    getMessageText(el) {
        return extractFirstLine(el);
    },

    /**
     * Extracts or generates a unique ID for a message element.
     *
     * Gemini may not always provide stable message IDs, so we
     * use data attributes when available and fall back to synthetic hashes.
     *
     * @param {HTMLElement} el
     * @returns {string|null}
     */
    getMessageId(el) {
        // Check for any data-based ID attribute on the element or ancestors
        const idAttrs = ['data-message-id', 'data-id', 'data-query-id', 'data-turn-id'];

        for (const attr of idAttrs) {
            if (el.getAttribute(attr)) {
                return el.getAttribute(attr);
            }
        }

        // Walk up to find a parent with an ID attribute
        let parent = el.parentElement;
        const maxDepth = 10;
        let depth = 0;

        while (parent && depth < maxDepth) {
            for (const attr of idAttrs) {
                if (parent.getAttribute(attr)) {
                    return parent.getAttribute(attr);
                }
            }
            // Also check standard id attribute
            if (parent.id && parent.id.length > 0) {
                return 'gemini-' + parent.id;
            }
            parent = parent.parentElement;
            depth++;
        }

        // Fallback: synthetic hash from content
        const text = el.innerText || '';
        return 'synthetic-' + simpleHash(text.slice(0, 200));
    },

    /**
     * Finds the best scroll target for a message element.
     * Walks up the DOM to find the conversation turn container.
     *
     * @param {HTMLElement} el
     * @returns {HTMLElement}
     */
    getScrollTarget(el) {
        let current = el;
        let candidate = el;
        const maxDepth = 15;
        let depth = 0;

        while (current && depth < maxDepth) {
            // Look for Gemini turn containers
            const tagName = current.tagName?.toLowerCase() || '';
            if (
                tagName === 'message-content' ||
                tagName === 'user-query' ||
                current.classList?.contains('conversation-turn') ||
                current.getAttribute('data-turn-role') === 'user' ||
                current.getAttribute('data-role') === 'user' ||
                current.classList?.contains('query-container')
            ) {
                candidate = current;
                break;
            }

            current = current.parentElement;
            depth++;
        }

        return candidate;
    },

    /**
     * Extracts the chat ID from the current URL.
     * Gemini URLs typically follow: /app/<id> or /chat/<id>
     *
     * @returns {string|null}
     */
    getChatId() {
        const path = window.location.pathname;

        // Try /app/<id> pattern
        let match = path.match(/\/app\/([a-zA-Z0-9_-]+)/);
        if (match) return match[1];

        // Try /chat/<id> pattern
        match = path.match(/\/chat\/([a-zA-Z0-9_-]+)/);
        if (match) return match[1];

        // Gemini may use hash-based routing
        const hash = window.location.hash;
        if (hash && hash.length > 1) {
            return 'gemini-' + simpleHash(hash);
        }

        // Fallback: use the full path as a synthetic ID if on Gemini
        // This handles cases where the user is on the main Gemini page
        if (path === '/' || path === '/app') {
            return 'gemini-main';
        }

        return 'gemini-' + simpleHash(path);
    },

    /**
     * Returns the attribute names to watch for MutationObserver.
     *
     * @returns {string[]}
     */
    getObservedAttributes() {
        return ['data-message-author', 'data-message-id', 'data-turn-role', 'data-role'];
    },

    /**
     * Returns a CSS selector that matches user messages.
     * Used for filtering added nodes in MutationObserver.
     *
     * @returns {string}
     */
    getUserMessageSelector() {
        return '.query-text, [data-message-author="user"], user-query, [data-user-query], .user-query-content, .query-content, [data-turn-role="user"], [data-role="user"]';
    },

    /**
     * Returns the display name for the empty state prompt.
     *
     * @returns {string}
     */
    getEmptyStateText() {
        return 'Start asking Gemini something.';
    }
};
