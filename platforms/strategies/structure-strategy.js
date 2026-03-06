/**
 * structure-strategy.js — Structural Detection Strategy
 *
 * Infers user messages using conversation patterns such as alternating user/assistant blocks.
 * Most useful when processing the entire DOM instead of single nodes, to find missing
 * sequences in a chat pattern (e.g., user -> assistant -> user).
 */

window.ThreadMapStructureStrategy = {
    name: 'StructureStrategy',

    /**
     * Inspects a conversational container and deduces roles based on DOM structure.
     * 
     * @param {HTMLElement} rootContainer - The chat container
     * @param {string} turnSelector - A selector indicating a conversational "turn" or "row"
     * @returns {HTMLElement[]} The identified user message elements.
     */
    detect(rootContainer, turnSelector) {
        if (!rootContainer || !turnSelector) return [];

        const turns = Array.from(rootContainer.querySelectorAll(turnSelector));
        const results = [];

        // Simple structural assumption: User typically initiates the turn (even index), 
        // Assistant responds (odd index), assuming user-first sequence.
        // Some platforms group user/assistant visually.

        let expectedRole = 'user'; // Starts with user 

        for (let i = 0; i < turns.length; i++) {
            const turn = turns[i];

            // This is a naive heuristic. Real platforms might vary, so this strategy 
            // is best used as a fallback if RoleStrategy yields nothing. 
            // Often, user turns have specific classes like "user-turn" or similar even if 
            // they don't have explicit data-roles.
            if (expectedRole === 'user') {
                // Try to find the inner text container to map
                results.push(turn);
                expectedRole = 'assistant';
            } else {
                expectedRole = 'user';
            }
        }

        return results;
    }
};
