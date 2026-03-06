/**
 * message-normalizer.js — Converts detected DOM nodes into Canonical Message Models
 *
 * Responsibilities:
 *   - Extract message text
 *   - Generate stable message ID (falling back to simpleHash)
 *   - Assign role and platform
 *   - Attach original DOM element (scroll target)
 */

window.ThreadMapMessageNormalizer = {
    /**
     * Converts a raw DOM element into a Canonical Message Model.
     * 
     * @param {HTMLElement} element - The original DOM node
     * @param {Object} platformAdapter - The current platform adapter handling extraction
     * @param {"user" | "assistant"} [role="user"] - Force a specific role, defaults to 'user'
     * @returns {MessageModel|null} - Returns the normalized message, or null if text could not be extracted
     */
    normalize(element, platformAdapter, role = "user") {
        if (!element || !platformAdapter) return null;

        // Extract text
        const text = platformAdapter.getMessageText(element);
        if (!text) return null;

        // Generate or extract ID
        let id = platformAdapter.getMessageId(element);
        if (!id) {
            // Synthetic fallback: hash of the first 100 characters of the text
            const textToHash = text.slice(0, 100);
            id = 'synthetic-' + (typeof simpleHash === 'function' ? simpleHash(textToHash) : textToHash.length);
        }

        // Determine scroll target (fallback to element itself)
        const scrollTarget = platformAdapter.getScrollTarget(element) || element;

        try {
            const message = new window.ThreadMapMessageModel({
                id: id,
                text: text,
                element: scrollTarget,
                role: role,
                platform: platformAdapter.name.toLowerCase()
            });
            message.validate();
            return message;
        } catch (e) {
            console.error('ThreadMap: Failed to normalize message:', e);
            return null;
        }
    }
};

if (typeof module !== "undefined" && module.exports) { module.exports = { MessageNormalizer: window.ThreadMapMessageNormalizer }; }
