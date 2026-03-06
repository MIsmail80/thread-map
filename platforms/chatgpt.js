/**
 * chatgpt.js — ChatGPT platform adapter for ThreadMap
 */

window.ThreadMapPlatforms = window.ThreadMapPlatforms || {};

window.ThreadMapPlatforms.chatgpt = {
    name: 'ChatGPT',
    capabilities: {}, // Injected by detector

    /** Required Adapter Function 1: Identify root container (optional based on architecture, used for observing) */
    getRootContainer() {
        return document.querySelector('main') || document.body;
    },

    /** Required Adapter Function 2: Run strategy pipeline on loaded DOM */
    getUserMessages() {
        // Find existing nodes using the strategy pipeline based on capabilities
        return this._runStrategies([document.body]);
    },

    /** Run pipeline on newly observed nodes to return Canonical Message Models */
    processAddedNodes(nodes) {
        const candidateElements = Array.from(nodes).filter(n => n.nodeType === Node.ELEMENT_NODE || n.nodeType === Node.TEXT_NODE);
        const rawMessages = this._runStrategies(candidateElements);

        return rawMessages
            .map(el => window.ThreadMapMessageNormalizer.normalize(el, this, "user"))
            .filter(Boolean);
    },

    /** Internal Strategy Pipeline Runner */
    _runStrategies(candidateElements) {
        let messages = [];
        if (this.capabilities.roleAttributes) {
            messages = window.ThreadMapRoleStrategy.detect(candidateElements);
        }
        return messages;
    },

    /**
     * Extracts text content.
     */
    getMessageText(el) {
        return extractFirstLine(el);
    },

    getMessageId(el) {
        if (el.getAttribute('data-message-id')) return el.getAttribute('data-message-id');
        let parent = el.parentElement;
        let depth = 0;
        while (parent && depth < 10) {
            if (parent.getAttribute('data-message-id')) return parent.getAttribute('data-message-id');
            parent = parent.parentElement;
            depth++;
        }
        return null; // Will trigger simpleHash fallback in Normalizer
    },

    /** Required Adapter Function 3: Get Scroll Target */
    getScrollTarget(el) {
        let current = el;
        let candidate = el;
        let depth = 0;
        while (current && depth < 15) {
            if (current.tagName === 'ARTICLE' || current.getAttribute('data-testid')?.includes('conversation-turn')) {
                candidate = current;
                break;
            }
            current = current.parentElement;
            depth++;
        }
        return candidate;
    },

    getChatId() {
        const match = window.location.pathname.match(/\/(?:c|g)\/([a-f0-9-]+)/i);
        return match ? match[1] : null;
    },

    getEmptyStateText() {
        return 'Start asking ChatGPT something.';
    }
};

if (typeof module !== "undefined" && module.exports) { module.exports = { ChatGPTAdapter: window.ThreadMapPlatforms.chatgpt }; }
