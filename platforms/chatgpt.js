/**
 * chatgpt.js — ChatGPT platform adapter for ThreadMap
 *
 * Handles all ChatGPT-specific DOM interactions:
 *   - Finding user messages
 *   - Extracting message IDs
 *   - Determining scroll targets
 *   - Extracting chat IDs from URL
 *
 * PRIVACY: No data leaves the browser. All processing is local.
 */

// ──────────────────────────────────────────────
// Platform Registration
// ──────────────────────────────────────────────

window.ThreadMapPlatforms = window.ThreadMapPlatforms || {};

window.ThreadMapPlatforms.chatgpt = {
    name: 'ChatGPT',

    /**
     * Returns all user message elements in the current conversation.
     * ChatGPT annotates messages with data-message-author-role="user".
     *
     * @returns {NodeList|Array<HTMLElement>}
     */
    getUserMessages() {
        return document.querySelectorAll('[data-message-author-role="user"]');
    },

    /**
     * Extracts the visible text content from a message element.
     *
     * @param {HTMLElement} el — The message element.
     * @returns {string|null} The first line of text.
     */
    getMessageText(el) {
        return extractFirstLine(el);
    },

    /**
     * Extracts or generates a unique ID for a message element.
     *
     * Strategy:
     *   1. Check for data-message-id on the element itself.
     *   2. Walk up the DOM to find a parent with data-message-id.
     *   3. Fallback: generate a synthetic hash from text content.
     *
     * @param {HTMLElement} el
     * @returns {string|null}
     */
    getMessageId(el) {
        // Direct attribute
        if (el.getAttribute('data-message-id')) {
            return el.getAttribute('data-message-id');
        }

        // Walk up to find a parent with the attribute
        let parent = el.parentElement;
        const maxDepth = 10;
        let depth = 0;

        while (parent && depth < maxDepth) {
            if (parent.getAttribute('data-message-id')) {
                return parent.getAttribute('data-message-id');
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
     * Walks up the DOM to find the outermost "turn" container.
     *
     * ChatGPT wraps each turn in an <article> or a div with
     * data-testid containing "conversation-turn".
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
            if (
                current.tagName === 'ARTICLE' ||
                current.getAttribute('data-testid')?.includes('conversation-turn')
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
     * ChatGPT URLs follow the pattern: /c/<uuid> or /g/<uuid>
     *
     * @returns {string|null}
     */
    getChatId() {
        const match = window.location.pathname.match(/\/(?:c|g)\/([a-f0-9-]+)/i);
        return match ? match[1] : null;
    },

    /**
     * Returns the attribute names to watch for MutationObserver.
     * ChatGPT may set data-message-author-role after the node is in the DOM.
     *
     * @returns {string[]}
     */
    getObservedAttributes() {
        return ['data-message-author-role', 'data-message-id'];
    },

    /**
     * Returns the user message selector for matching added nodes.
     *
     * @returns {string}
     */
    getUserMessageSelector() {
        return '[data-message-author-role="user"]';
    },

    /**
     * Returns the display name for the empty state prompt.
     *
     * @returns {string}
     */
    getEmptyStateText() {
        return 'Start asking ChatGPT something.';
    }
};
