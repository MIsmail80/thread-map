import { describe, it, expect, beforeEach } from 'vitest';
import { ClaudeAdapter } from '../../platforms/claude.js';
import fs from 'fs';
import path from 'path';

describe('ClaudeAdapter', () => {
    let doc;

    beforeEach(() => {
        const htmlPath = path.resolve(__dirname, '../fixtures/claude-dom.html');
        const html = fs.readFileSync(htmlPath, 'utf-8');
        document.body.innerHTML = html;
        doc = document;

        // Polyfill for normal environment functions
        global.extractFirstLine = (el) => el.textContent.trim();
        global.window.ThreadMapMessageNormalizer = {
            normalize: (el, adapter, role) => ({
                id: 'synthetic-hash',
                role: role,
                text: extractFirstLine(el),
                element: el,
                platform: adapter.name.toLowerCase()
            })
        };
    });

    afterEach(() => {
        delete global.extractFirstLine;
        delete global.window.ThreadMapMessageNormalizer;
    });

    describe('getUserMessages & processAddedNodes', () => {
        it('successfully locates user messages in Claude DOM', () => {
            const msgs = ClaudeAdapter.getUserMessages();
            expect(msgs.length).toBeGreaterThan(0);
            expect(msgs[0].classList.contains('font-user-message')).toBe(true);
        });

        it('normalizes found messages to Canonical Model via processAddedNodes', () => {
            const msgs = ClaudeAdapter.processAddedNodes([doc.body]);
            expect(msgs.length).toBeGreaterThan(0);
            expect(msgs[0].platform).toBe('claude');
            expect(msgs[0].role).toBe('user');
            expect(msgs[0].text).toContain('How do I test a React component?');
        });
    });
});
