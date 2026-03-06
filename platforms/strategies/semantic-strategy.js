/**
 * semantic-strategy.js — Semantic Detection Strategy
 *
 * Detects message blocks based on heuristics like text length and lack of code blocks.
 * Used for platforms that don't rely heavily on strict data attributes (like Gemini).
 */

window.ThreadMapSemanticStrategy = {
    name: 'SemanticStrategy',

    /**
     * Determines if a node looks like a user message.
     * Heuristics:
     * - Contains natural text.
     * - Text length between 10 and 2000 chars.
     * - Does not primarily consist of code blocks (user queries usually don't START as pure pre blocks).
     * 
     * @param {HTMLElement[] | NodeList} candidateNodes 
     * @param {Function} [textExtractor] Optional platform-specific text extractor
     * @returns {HTMLElement[]}
     */
    detect(candidateNodes, textExtractor) {
        const extractText = textExtractor || window.extractFirstLine || ((el) => el.innerText);
        const results = [];

        // For this strategy, we usually need to iterate over known text containers.
        // We look for elements that might contain the text, but aren't code blocks.
        for (const node of candidateNodes) {
            // We need to inspect the node itself or its likely text-containing children
            const textContainers = [];
            if (node.nodeType === Node.ELEMENT_NODE) {
                textContainers.push(node);
                if (node.parentElement) textContainers.push(node.parentElement);
                if (node.querySelectorAll) {
                    // Heuristic: user queries in Gemini are often in generic divs or paragraphs
                    node.querySelectorAll('div, p, query-text').forEach(n => textContainers.push(n));
                }
            } else if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
                textContainers.push(node.parentElement);
            }

            for (const container of textContainers) {
                if (container.nodeType !== Node.ELEMENT_NODE) continue;

                // Exclude elements that are scripts, styles, buttons, or inside code blocks
                if (
                    container.tagName === 'SCRIPT' ||
                    container.tagName === 'STYLE' ||
                    container.tagName === 'NOSCRIPT' ||
                    container.tagName === 'PRE' ||
                    container.tagName === 'CODE' ||
                    container.tagName === 'BUTTON' ||
                    container.closest('pre, code, script, style, noscript, button')
                ) {
                    continue;
                }

                // Check text heuristics
                const text = extractText(container);
                if (text && text.length >= 10 && text.length <= 2000) {
                    // Check if we haven't already captured a parent of this node
                    const isRedundant = results.some(r => r.contains(container));
                    if (!isRedundant) {
                        results.push(container);
                    }
                }
            }
        }

        return results;
    }
};

if (typeof module !== "undefined" && module.exports) { module.exports = { SemanticStrategy: window.ThreadMapSemanticStrategy }; }
