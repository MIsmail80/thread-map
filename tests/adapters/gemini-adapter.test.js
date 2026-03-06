import { describe, it, expect, beforeEach } from 'vitest';
import { GeminiAdapter } from '../../platforms/gemini.js';
import fs from 'fs';
import path from 'path';

describe('GeminiAdapter', () => {
    let doc;

    beforeEach(() => {
        const htmlPath = path.resolve(__dirname, '../fixtures/gemini-dom.html');
        const html = fs.readFileSync(htmlPath, 'utf-8');
        document.body.innerHTML = html;
        doc = document;

        // Mock text extractor ignoring screen readers typical for gemini
        global.extractFirstLine = (el) => {
            const clone = el.cloneNode(true);
            clone.querySelectorAll('.sr-only, .visually-hidden').forEach(n => n.remove());
            return clone.textContent.trim();
        };

        global.window.ThreadMapMessageNormalizer = {
            normalize: (el, adapter, role) => ({
                id: 'synthetic-hash',
                role: role,
                text: adapter.getMessageText(el),
                element: el,
                platform: adapter.name.toLowerCase()
            })
        };
        global.simpleHash = () => 'hash789';
    });

    afterEach(() => {
        delete global.extractFirstLine;
        delete global.window.ThreadMapMessageNormalizer;
        delete global.simpleHash;
    });

    describe('getUserMessages & processAddedNodes', () => {
        it('successfully locates user query containers in Gemini DOM', () => {
            const msgs = GeminiAdapter.getUserMessages();
            expect(msgs.length).toBeGreaterThan(0);
            expect(msgs[0].classList.contains('query-text')).toBe(true);
        });

        it('normalizes found messages bypassing structural hidden labels', () => {
            const msgs = GeminiAdapter.processAddedNodes([doc.body]);
            expect(msgs.length).toBeGreaterThan(0);
            expect(msgs[0].platform).toBe('gemini');
            expect(msgs[0].role).toBe('user');

            // Ensures "You said:" was bypassed functionally by the text extractor mock
            expect(msgs[0].text).toContain('What is the capital of France?');
            expect(msgs[0].text).not.toContain('You said');
        });
    });
});
