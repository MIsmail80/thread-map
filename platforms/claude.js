/**
 * claude.js — Claude platform adapter for ThreadMap
 *
 * Handles all Claude-specific DOM interactions:
 *   - Finding user messages
 *   - Extracting message text and IDs
 *   - Determining scroll targets
 *   - Extracting chat IDs from URL
 *
 * Claude's DOM uses data attributes and structured conversation blocks.
 *
 * PRIVACY: No data leaves the browser. All processing is local.
 */

// ──────────────────────────────────────────────
// Platform Registration
// ──────────────────────────────────────────────

window.ThreadMapPlatforms = window.ThreadMapPlatforms || {};

window.ThreadMapPlatforms.claude = {
    name: 'Claude',

    /**
     * Returns all user message elements in the current conversation.
     *
     * Claude uses data attributes to identify message roles.
     * We try multiple selectors for resilience against DOM changes.
     *
     * @returns {NodeList|Array<HTMLElement>}
     */
    getUserMessages() {
        // Strategy 1: Direct role attribute (most common)
        let messages = document.querySelectorAll('[data-testid="user-message"]');
        if (messages.length > 0) return messages;

        // Strategy 2: Author role data attribute
        messages = document.querySelectorAll('[data-message-author-role="user"]');
        if (messages.length > 0) return messages;

        // Strategy 3: Claude conversation row with user role
        messages = document.querySelectorAll('[data-is-user-message="true"]');
        if (messages.length > 0) return messages;

        // Strategy 4: Look for user message containers by class
        messages = document.querySelectorAll('.user-message, .human-message');
        if (messages.length > 0) return messages;

        // Strategy 5: Conversation turns with role indicators
        messages = document.querySelectorAll('[data-role="user"], [data-sender="human"]');
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
     * @param {HTMLElement} el
     * @returns {string|null}
     */
    getMessageId(el) {
        // Check for common ID attributes
        const idAttrs = ['data-message-id', 'data-id', 'data-testid'];

        for (const attr of idAttrs) {
            const val = el.getAttribute(attr);
            if (val && val !== 'user-message') {
                return val;
            }
        }

        // Walk up to find a parent with an ID attribute
        let parent = el.parentElement;
        const maxDepth = 10;
        let depth = 0;

        while (parent && depth < maxDepth) {
            for (const attr of idAttrs) {
                const val = parent.getAttribute(attr);
                if (val && !val.startsWith('user-message')) {
                    return val;
                }
            }
            if (parent.id && parent.id.length > 0) {
                return 'claude-' + parent.id;
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
     * Walks up the DOM to find the conversation block container.
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
            // Look for Claude conversation containers
            if (
                current.getAttribute('data-testid')?.includes('conversation') ||
                current.getAttribute('data-is-user-message') === 'true' ||
                current.classList?.contains('conversation-row') ||
                current.classList?.contains('message-row') ||
                current.getAttribute('data-role') === 'user' ||
                current.getAttribute('data-sender') === 'human'
            ) {
                candidate = current;
                break;
            }

            if (current.parentElement && current.parentElement.tagName !== 'MAIN') {
                candidate = current;
            }

            current = current.parentElement;
            depth++;
        }

        return candidate;
    },

    /**
     * Extracts the chat ID from the current URL.
     * Claude URLs follow: /chat/<uuid>
     *
     * @returns {string|null}
     */
    getChatId() {
        const path = window.location.pathname;

        // /chat/<uuid> pattern
        const match = path.match(/\/chat\/([a-f0-9-]+)/i);
        if (match) return match[1];

        // Fallback for other URL patterns
        const segments = path.split('/').filter(Boolean);
        if (segments.length >= 2) {
            return 'claude-' + segments[segments.length - 1];
        }

        return null;
    },

    /**
     * Returns the attribute names to watch for MutationObserver.
     *
     * @returns {string[]}
     */
    getObservedAttributes() {
        return ['data-message-author-role', 'data-message-id', 'data-testid', 'data-is-user-message', 'data-role', 'data-sender'];
    },

    /**
     * Returns a CSS selector that matches user messages.
     * Used for filtering added nodes in MutationObserver.
     *
     * @returns {string}
     */
    getUserMessageSelector() {
        return '[data-testid="user-message"], [data-message-author-role="user"], [data-is-user-message="true"], .user-message, .human-message, [data-role="user"], [data-sender="human"]';
    },

    /**
     * Returns the display name for the empty state prompt.
     *
     * @returns {string}
     */
    getEmptyStateText() {
        return 'Start asking Claude something.';
    }
};
