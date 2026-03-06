import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SemanticStrategy } from '../../platforms/strategies/semantic-strategy.js';

describe('SemanticStrategy', () => {
    beforeEach(() => {
        global.window.extractFirstLine = (el) => el.textContent.trim();
    });

    afterEach(() => {
        delete global.window.extractFirstLine;
        document.body.innerHTML = ''; // Ensure DOM is clean
    });

    describe('detect', () => {
        it('detects potential user messages based on text length heuristics', () => {
            document.body.innerHTML = '<div id="valid-msg">This is a valid natural text user message that is between 10 and 2000 chars.</div>';
            const validMsg = document.getElementById('valid-msg');
            const results = SemanticStrategy.detect([validMsg]);
            expect(results.length).toBeGreaterThan(0);
        });

        it('ignores text blocks that are too short', () => {
            document.body.innerHTML = '<div id="too-short">Short</div>';
            const tooShort = document.getElementById('too-short');
            const results = SemanticStrategy.detect([tooShort]);
            expect(results.length).toBe(0);
        });

        it('ignores text blocks that consist primarily of code blocks', () => {
            document.body.innerHTML = '<div id="code-msg"><pre id="pre-block"><code>console.log("test");</code></pre></div>';
            const codeMsg = document.getElementById('code-msg');
            const results = SemanticStrategy.detect([codeMsg]);

            const preBlock = document.getElementById('pre-block');
            // The strategy should explicitly exclude the <pre> block from its results
            expect(results).not.toContain(preBlock);
        });
    });
});
