import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageNormalizer } from '../../core/message-normalizer.js';

describe('MessageNormalizer', () => {
    let doc;

    beforeEach(() => {
        document.body.innerHTML = `
      <div id="m1" class="user-turn">Hello AI</div>
      <div id="m2" class="assistant-turn" data-message-id="msg-123">I have an ID</div>
    `;
        doc = document;

        // Mock the global MessageModel class which normalizer instantiates
        global.window.ThreadMapMessageModel = class {
            constructor(data) { Object.assign(this, data); }
            validate() { }
        };

        global.simpleHash = (str) => 'hash123';
    });

    afterEach(() => {
        delete global.window.ThreadMapMessageModel;
        delete global.simpleHash;
    });

    describe('normalize', () => {
        it('creates a canonical message object with expected structure', () => {
            const el = doc.getElementById('m1');
            const mockAdapter = {
                name: 'test-platform',
                getMessageText: vi.fn().mockReturnValue('Hello AI'),
                getMessageId: vi.fn().mockReturnValue('user-msg-1'),
                getScrollTarget: vi.fn().mockReturnValue(el)
            };

            const msg = MessageNormalizer.normalize(el, mockAdapter, 'user');

            expect(msg.id).toBe('user-msg-1');
            expect(msg.element).toBe(el);
            expect(msg.role).toBe('user');
            expect(msg.platform).toBe('test-platform');
            expect(msg.text).toBe('Hello AI');
        });

        it('generates a synthetic ID if adapter provides none', () => {
            const el = doc.getElementById('m1');
            const mockAdapter = {
                name: 'test-platform',
                getMessageText: vi.fn().mockReturnValue('Hello AI'),
                getMessageId: vi.fn().mockReturnValue(null), // no ID
                getScrollTarget: vi.fn().mockReturnValue(el)
            };

            const msg = MessageNormalizer.normalize(el, mockAdapter, 'user');
            expect(msg.id).toContain('synthetic-hash123');
        });
    });
});
