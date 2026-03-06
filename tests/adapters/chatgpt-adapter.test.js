import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChatGPTAdapter } from '../../platforms/chatgpt.js';
import fs from 'fs';
import path from 'path';

describe('ChatGPTAdapter', () => {
    let doc;

    beforeEach(() => {
        const htmlPath = path.resolve(__dirname, '../fixtures/chatgpt-dom.html');
        const html = fs.readFileSync(htmlPath, 'utf-8');
        document.body.innerHTML = html;
        doc = document;

        global.window.ThreadMapRoleStrategy = {
            detect: vi.fn().mockReturnValue([doc.querySelector('.user-message')])
        };
        global.window.ThreadMapMessageNormalizer = {
            normalize: vi.fn().mockReturnValue({ id: '1', role: 'user', text: 'mock' })
        };
        global.extractFirstLine = (el) => el.textContent.trim();
    });

    afterEach(() => {
        delete global.window.ThreadMapRoleStrategy;
        delete global.window.ThreadMapMessageNormalizer;
        delete global.extractFirstLine;
    });

    describe('getUserMessages', () => {
        it('calls the RoleStrategy internally', () => {
            // Configure adapter to use role attributes
            ChatGPTAdapter.capabilities = { roleAttributes: true };

            const msgs = ChatGPTAdapter.getUserMessages();

            // Strategy mocked to return 1 element
            expect(global.window.ThreadMapRoleStrategy.detect).toHaveBeenCalled();
            expect(msgs.length).toBe(1);
        });
    });

    describe('processAddedNodes', () => {
        it('uses normalizer on matched elements', () => {
            ChatGPTAdapter.capabilities = { roleAttributes: true };
            const normalized = ChatGPTAdapter.processAddedNodes([doc.body]);

            expect(global.window.ThreadMapMessageNormalizer.normalize).toHaveBeenCalled();
            expect(normalized.length).toBe(1);
        });
    });
});
