/**
 * content.js — Entry point for ThreadMap
 *
 * Orchestrates initialization, teardown, and lifecycle management.
 * Delegates all logic to specialized modules:
 *   - utils.js:              Pure helpers (text trimming, debounce, hashing)
 *   - core/event-bus.js      Event bus for inter-module communication
 *   - core/message-stream.js Event-based message detection
 *   - observer/optimized-observer.js Targeted DOM observation
 *   - toc-ui.js:             Shadow DOM floating panel
 *   - platforms/*.js:         Platform-specific DOM adapters
 *
 * ══════════════════════════════════════════════════════════
 *  PRIVACY NOTICE
 *  This extension processes all data locally in the browser.
 *  No data is sent to any external server, API, or service.
 *  No analytics or tracking of any kind.
 * ══════════════════════════════════════════════════════════
 */

const INIT_DELAY_MS = 800;
const MAX_INIT_RETRIES = 30;
const RETRY_INTERVAL_MS = 500;

let isActive = false;
let currentChatId = null;
let tocItemCount = 0;
let currentPlatform = null;

function _isExtensionContextValid() {
    try {
        return !!(chrome && chrome.runtime && chrome.runtime.getURL);
    } catch (e) {
        return false;
    }
}

function main() {
    if (!_isExtensionContextValid()) return;

    currentPlatform = detectPlatform();
    if (!currentPlatform) {
        console.warn('ThreadMap: No supported platform detected on this page.');
        return;
    }

    loadSettings().then(() => {
        if (!getSetting('enabled')) return;
        setTimeout(() => {
            _tryInit(0);
        }, INIT_DELAY_MS);
    });

    listenForNavigation(() => {
        _handleNavigation();
    });

    onSettingsChanged((settings) => {
        if (!settings.enabled && isActive) {
            _teardown();
        } else if (settings.enabled && !isActive) {
            _tryInit(0);
        }
    });

    // Register event bus listener for new messages
    window.ThreadMapEventBus.on('message-added', (message) => {
        if (!isActive) return;
        tocItemCount++;
        const item = {
            id: message.id,
            label: trimLabel(message.text),
            element: message.element
        };
        // Use addTOCItem for incremental updates
        if (typeof addTOCItem === 'function') {
            addTOCItem(item, tocItemCount);
        }
    });
}

function _tryInit(attempt) {
    if (!_isExtensionContextValid()) return;
    if (!currentPlatform) return;

    const chatId = currentPlatform.getChatId();

    if (!chatId) {
        _teardown();
        return;
    }

    const messageElements = currentPlatform.getUserMessages();

    if (messageElements.length === 0 && attempt < MAX_INIT_RETRIES) {
        setTimeout(() => _tryInit(attempt + 1), RETRY_INTERVAL_MS);
        return;
    }

    if (messageElements.length === 0) {
        console.warn('ThreadMap: No user messages found — DOM structure may have changed for', currentPlatform.name);
        return;
    }

    _activate(chatId);
}

function _activate(chatId) {
    if (isActive && currentChatId === chatId) return;
    if (!getSetting('enabled')) return;

    if (isActive) {
        _teardown();
    }

    currentChatId = chatId;
    isActive = true;
    tocItemCount = 0;

    createPanel(currentPlatform);

    // Initialize Message Stream
    window.ThreadMapMessageStream.init(currentPlatform);

    // Pre-clear TOC before full rescan populates it
    renderTOC([]);

    // Rescan existing messages, which will emit 'message-added' events
    window.ThreadMapMessageStream.fullRescan();

    // Start targeted observer for new messages
    window.ThreadMapObserver.start(currentPlatform);
}

function refreshTOC() {
    if (!isActive) {
        _tryInit(0);
        return;
    }

    // Reset counts and empty TOC
    tocItemCount = 0;
    renderTOC([]);

    // Reset stream state to clear seen messages
    window.ThreadMapMessageStream.reset();

    // Re-scan and emit everything again
    window.ThreadMapMessageStream.fullRescan();
}

function _teardown() {
    window.ThreadMapObserver.stop();
    destroyPanel();

    // Clear state
    if (window.ThreadMapMessageStream) {
        window.ThreadMapMessageStream.reset();
    }

    isActive = false;
    currentChatId = null;
    tocItemCount = 0;
}

function _handleNavigation() {
    _teardown();
    setTimeout(() => {
        _tryInit(0);
    }, INIT_DELAY_MS);
}

/** SPA Navigation Fallback Handlers (Extracted from old observer logic) */
let lastKnownUrl = null;
let urlPollTimer = null;
let popstateHandler = null;
const URL_POLL_INTERVAL_MS = 500;

function listenForNavigation(onNavigate) {
    lastKnownUrl = window.location.href;

    popstateHandler = () => {
        const newUrl = window.location.href;
        if (newUrl !== lastKnownUrl) {
            lastKnownUrl = newUrl;
            onNavigate(newUrl);
        }
    };

    window.addEventListener('popstate', popstateHandler);

    urlPollTimer = setInterval(() => {
        const currentUrl = window.location.href;
        if (currentUrl !== lastKnownUrl) {
            lastKnownUrl = currentUrl;
            onNavigate(currentUrl);
        }
    }, URL_POLL_INTERVAL_MS);
}

// Bootstrap
main();
