/**
 * role-strategy.js — Role-based Detection Strategy
 *
 * Scans nodes for specific role attributes indicating user messages.
 * Ideal for platforms like ChatGPT and Claude that use distinct attributes.
 */

window.ThreadMapRoleStrategy = {
    name: 'RoleStrategy',

    /**
     * Finds nodes among candidates that represent user messages based on data-attributes.
     * 
     * @param {HTMLElement[] | NodeList} candidateNodes 
     * @returns {HTMLElement[]} Array of matched elements
     */
    detect(candidateNodes) {
        const results = [];
        const selectors = [
            '[data-message-author-role="user"]',
            '[data-author="user"]',
            '[data-testid="user-message"]',
            '.user-message' // Generic fallback for robust checking
        ];
        const combinedSelector = selectors.join(', ');

        for (const node of candidateNodes) {
            const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
            if (!el || el.nodeType !== Node.ELEMENT_NODE) continue;

            // Ancestor or Node itself matches
            const closest = el.closest(combinedSelector);
            if (closest) {
                results.push(closest);
            }

            // Descendants match
            if (el.querySelectorAll) {
                const matches = el.querySelectorAll(combinedSelector);
                for (const match of matches) {
                    results.push(match);
                }
            }
        }

        return Array.from(new Set(results));
    }
};
