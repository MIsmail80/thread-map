import { describe, it, expect, beforeEach } from 'vitest';
import { RoleStrategy } from '../../platforms/strategies/role-strategy.js';
import fs from 'fs';
import path from 'path';

describe('RoleStrategy', () => {
    let doc;

    beforeEach(() => {
        const htmlPath = path.resolve(__dirname, '../fixtures/chatgpt-dom.html');
        const html = fs.readFileSync(htmlPath, 'utf-8');
        document.body.innerHTML = html;
        doc = document;
    });

    describe('detect', () => {
        it('finds nodes with matching user message classes/attributes', () => {
            // Role strategy hardcodes the selectors it searches for in the detect method
            const candidateNodes = [doc.body];
            const results = RoleStrategy.detect(candidateNodes);

            expect(results.length).toBeGreaterThan(0);

            // Ensure it matched the user message container from our fixture
            const isUserMsg = results.some(el => el.classList.contains('user-message'));
            expect(isUserMsg).toBe(true);

            // Ensure it didn't match the assistant message
            const isAssistantMsg = results.some(el => el.classList.contains('assistant-message'));
            expect(isAssistantMsg).toBe(false);
        });

        it('returns empty array if no matches', () => {
            const emptyDiv = document.createElement('div');
            emptyDiv.innerHTML = '<p>Nothing here</p>';
            const results = RoleStrategy.detect([emptyDiv]);
            expect(results.length).toBe(0);
        });
    });
});
