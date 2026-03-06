import { describe, it, expect } from 'vitest';
import { extractFirstLine, trimLabel, simpleHash, detectTextDirection } from '../../utils.js';

describe('Text Utilities', () => {
    describe('extractFirstLine', () => {
        it('returns null for null element', () => {
            expect(extractFirstLine(null)).toBeNull();
        });

        it('extracts the first non-empty line of text', () => {
            const el = document.createElement('div');
            el.innerHTML = `
        <p>   </p>
        <p>First actual line</p>
        <p>Second line</p>
      `;
            expect(extractFirstLine(el)).toBe('First actual line');
        });

        it('strips out visually hidden screen-reader text', () => {
            const el = document.createElement('div');
            el.innerHTML = `
        <span class="sr-only">Hidden text</span>
        <span class="visually-hidden">Also hidden</span>
        <div>Visible text</div>
      `;
            expect(extractFirstLine(el)).toBe('Visible text');
        });

        it('explicitly removes script and style tags', () => {
            const el = document.createElement('div');
            el.innerHTML = `
        <style>.hidden { display: none; }</style>
        <script>console.log("test");</script>
        <div>Content text</div>
      `;
            expect(extractFirstLine(el)).toBe('Content text');
        });

        it('handles Gemini "You said" prefix variations', () => {
            const el = document.createElement('div');

            el.innerHTML = 'You said: Hello world';
            expect(extractFirstLine(el)).toBe('Hello world');

            el.innerHTML = 'You said\nHello world';
            expect(extractFirstLine(el)).toBe('Hello world');

            el.innerHTML = 'You said Hello world';
            expect(extractFirstLine(el)).toBe('Hello world');
        });

        it('ignores isolated "You said" text', () => {
            const el = document.createElement('div');
            el.innerHTML = `
        <div>You said</div>
        <div>Actual question</div>
      `;
            expect(extractFirstLine(el)).toBe('Actual question');
        });
    });

    describe('trimLabel', () => {
        it('returns empty string if falsy', () => {
            expect(trimLabel(null, 20)).toBe('');
            expect(trimLabel('', 20)).toBe('');
        });

        it('returns text as-is if under max length', () => {
            const text = 'Short text';
            expect(trimLabel(text, 20)).toBe(text);
        });

        it('truncates text and appends ellipsis if over max length', () => {
            const text = 'This is a very long text that should be truncated';
            const result = trimLabel(text, 20);
            expect(result.length).toBe(20); // 19 (trimmed) + 1 for ellipsis
            expect(result.endsWith('…')).toBe(true);
            expect(result.startsWith('This is a very long')).toBe(true);
        });
    });

    describe('simpleHash', () => {
        it('generates a stable hash for a given string', () => {
            const hash1 = simpleHash('Hello world');
            const hash2 = simpleHash('Hello world');
            expect(hash1).toBe(hash2);
            expect(typeof hash1).toBe('string');
            expect(hash1.length).toBeGreaterThan(0);
        });

        it('generates different hashes for different strings', () => {
            expect(simpleHash('Hello world')).not.toBe(simpleHash('hello world'));
        });
    });

    describe('detectTextDirection', () => {
        it('returns ltr for english text (fallback path)', () => {
            // Create mock platform detector as expected by fallback
            global.detectPlatform = () => ({
                getUserMessages: () => {
                    const el = document.createElement('div');
                    el.textContent = 'Hello, how are you today?';
                    return [el];
                }
            });
            expect(detectTextDirection()).toBe('ltr');
            delete global.detectPlatform;
        });

        it('returns rtl for arabic text (fallback path)', () => {
            global.detectPlatform = () => ({
                getUserMessages: () => {
                    const el = document.createElement('div');
                    el.textContent = 'مرحبا كيف حالك؟';
                    return [el];
                }
            });
            expect(detectTextDirection()).toBe('rtl');
            delete global.detectPlatform;
        });

        it('uses ThreadMapMessageStream if available', () => {
            global.window.ThreadMapMessageStream = {
                getMessages: () => [
                    { text: 'مرحبا' },
                    { text: 'كيف حالك' }
                ]
            };
            expect(detectTextDirection()).toBe('rtl');
            delete global.window.ThreadMapMessageStream;
        });
    });
});
