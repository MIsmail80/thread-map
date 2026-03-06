/**
 * claude.js — Claude platform adapter for ThreadMap
 */

window.ThreadMapPlatforms = window.ThreadMapPlatforms || {};

window.ThreadMapPlatforms.claude = {
    name: 'Claude',
    capabilities: {},

    getRootContainer() {
        return document.querySelector('main') || document.body;
    },

    getUserMessages() {
        return this._runStrategies([document.body]);
    },

    processAddedNodes(nodes) {
        const candidateElements = Array.from(nodes).filter(n => n.nodeType === Node.ELEMENT_NODE || n.nodeType === Node.TEXT_NODE);
        const rawMessages = this._runStrategies(candidateElements);

        return rawMessages
            .map(el => window.ThreadMapMessageNormalizer.normalize(el, this, "user"))
            .filter(Boolean);
    },

    _runStrategies(candidateElements) {
        let messages = [];

        // 1. Check specific Claude selectors first
        // '.font-user-message' is the main text styling class for Claude prompts
        const claudeSelectors = '.font-user-message, [data-is-user-message="true"], [data-sender="human"], [data-testid="user-message"]';

        for (const node of candidateElements) {
            const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
            if (!el || el.nodeType !== Node.ELEMENT_NODE) continue;

            if (el.matches && el.matches(claudeSelectors)) {
                messages.push(el);
            } else if (el.closest(claudeSelectors)) {
                messages.push(el.closest(claudeSelectors));
            }

            if (el.querySelectorAll) {
                el.querySelectorAll(claudeSelectors).forEach(m => messages.push(m));
            }
        }

        // 2. Try generic role attributes if nothing found (Claude usually has specific ones above)
        if (messages.length === 0 && this.capabilities.roleAttributes) {
            const roleMatches = window.ThreadMapRoleStrategy.detect(candidateElements);
            messages.push(...roleMatches);
        }

        // 3. Filter out anything outside the main chat area (e.g. sidebar profile name)
        // Claude wraps chat in <main> or sometimes <div> inside layout
        const mainContainer = document.querySelector('main, .container') || document.body;

        messages = messages.filter(msg => {
            // If the element is somehow up in the <nav> or absolutely positioned header, ignore it
            if (msg.closest('nav, header, aside, [data-testid="sidebar"]')) return false;
            // Also ensure it's inside our main container
            return mainContainer.contains(msg) || mainContainer === document.body;
        });

        return Array.from(new Set(messages));
    },

    getMessageText(el) {
        // Claude sometimes wraps the user message with a profile icon name span that shares text containers.
        const clone = el.cloneNode(true);
        // Remove profile badges, SVGs, or name tags often found alongside user prompts
        const hiddenSelectors = ['.sr-only', '.visually-hidden', '[data-testid*="profile"]', 'svg', '.font-user-message-name'];
        hiddenSelectors.forEach(sel => {
            clone.querySelectorAll(sel).forEach(n => n.remove());
        });
        return extractFirstLine(clone);
    },

    getMessageId(el) {
        const idAttrs = ['data-message-id', 'data-id', 'data-testid'];
        for (const attr of idAttrs) {
            const val = el.getAttribute(attr);
            if (val && val !== 'user-message') return val;
        }
        let parent = el.parentElement;
        let depth = 0;
        while (parent && depth < 10) {
            for (const attr of idAttrs) {
                const val = parent.getAttribute(attr);
                if (val && !val.startsWith('user-message')) return val;
            }
            if (parent.id && parent.id.length > 0) return 'claude-' + parent.id;
            parent = parent.parentElement;
            depth++;
        }
        return null;
    },

    getScrollTarget(el) {
        let current = el;
        let candidate = el;
        let depth = 0;
        while (current && depth < 15) {
            if (
                current.getAttribute('data-is-user-message') === 'true' ||
                current.classList?.contains('font-user-message') ||
                current.classList?.contains('message-row') ||
                current.getAttribute('data-sender') === 'human'
            ) {
                candidate = current;
                break;
            }
            current = current.parentElement;
            depth++;
        }
        return candidate;
    },

    getChatId() {
        const path = window.location.pathname;
        const match = path.match(/\/chat\/([a-f0-9-]+)/i);
        if (match) return match[1];
        const segments = path.split('/').filter(Boolean);
        if (segments.length >= 2) return 'claude-' + segments[segments.length - 1];
        return null;
    },

    getEmptyStateText() {
        return 'Start asking Claude something.';
    }
};

if (typeof module !== "undefined" && module.exports) { module.exports = { ClaudeAdapter: window.ThreadMapPlatforms.claude }; }
