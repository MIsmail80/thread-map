import { expect, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';

// Create a basic jsdom environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost',
});

// Set global DOM objects
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.Event = dom.window.Event;
global.MutationObserver = dom.window.MutationObserver;

// Clean up document body after each test
afterEach(() => {
    document.body.innerHTML = '';
});
