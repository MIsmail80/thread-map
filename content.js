/**
 * content.js — Entry point for ThreadMap
 *
 * Orchestrates initialization, teardown, and lifecycle management.
 * Delegates all logic to specialized modules:
 *   - utils.js:              Pure helpers (text trimming, debounce, hashing)
 *   - observer.js:           DOM observation and SPA navigation detection
 *   - toc-ui.js:             Shadow DOM floating panel
 *   - platform-detector.js:  Platform detection (ChatGPT, Gemini, Claude)
 *   - platforms/*.js:         Platform-specific DOM adapters
 *
 * ══════════════════════════════════════════════════════════
 *  PRIVACY NOTICE
 *  This extension processes all data locally in the browser.
 *  No data is sent to any external server, API, or service.
 *  No analytics or tracking of any kind.
 * ══════════════════════════════════════════════════════════
 */

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

/**
 * Delay (ms) before initializing after page load or navigation.
 * Gives the platform time to render conversation messages.
 */
const INIT_DELAY_MS = 800;

/**
 * Maximum retries when waiting for messages to appear in the DOM.
 * Each retry waits RETRY_INTERVAL_MS before checking again.
 * 30 retries × 500ms = 15 seconds — handles slow page loads.
 */
const MAX_INIT_RETRIES = 30;

/** Delay (ms) between initialization retries */
const RETRY_INTERVAL_MS = 500;

// ──────────────────────────────────────────────
// Module State
// ──────────────────────────────────────────────

/** @type {boolean} Whether the extension is currently active */
let isActive = false;

/** @type {string|null} Current chat ID */
let currentChatId = null;

/** @type {number} Running count of TOC items rendered */
let tocItemCount = 0;

/** @type {Object|null} Current platform adapter */
let currentPlatform = null;

// ──────────────────────────────────────────────
// Extension Context Guard
// ──────────────────────────────────────────────

/**
 * Checks if the Chrome extension context is still valid.
 * It becomes invalid after the extension is reloaded/updated
 * while the content script is still running on a page.
 *
 * @returns {boolean}
 */
function _isExtensionContextValid() {
    try {
        return !!(chrome && chrome.runtime && chrome.runtime.getURL);
    } catch (e) {
        return false;
    }
}

// ──────────────────────────────────────────────
// Initialization
// ──────────────────────────────────────────────

/**
 * Main entry point. Detects platform, loads settings, then waits
 * for the page to settle and initializes if we're on a conversation page.
 */
function main() {
    // Bail out if extension context was invalidated
    if (!_isExtensionContextValid()) return;

    // Detect the current platform
    currentPlatform = detectPlatform();
    if (!currentPlatform) {
        console.warn('ThreadMap: No supported platform detected on this page.');
        return;
    }

    // Pass the platform adapter to the observer module
    setObserverPlatform(currentPlatform);

    // Load settings first, then initialize
    loadSettings().then(() => {
        // Check if extension is enabled
        if (!getSetting('enabled')) return;

        // Wait for the platform to finish initial render
        setTimeout(() => {
            _tryInit(0);
        }, INIT_DELAY_MS);
    });

    // Listen for SPA navigation events
    listenForNavigation(() => {
        _handleNavigation();
    });

    // Listen for live settings changes
    onSettingsChanged((settings) => {
        if (!settings.enabled && isActive) {
            _teardown();
        } else if (settings.enabled && !isActive) {
            _tryInit(0);
        }
    });
}

/**
 * Attempts to initialize the TOC. Retries if the chat container
 * isn't ready yet (platforms load content asynchronously).
 *
 * @param {number} attempt — Current retry attempt (0-based).
 */
function _tryInit(attempt) {
    // Bail out if extension context was invalidated
    if (!_isExtensionContextValid()) return;
    if (!currentPlatform) return;

    const chatId = currentPlatform.getChatId();

    if (!chatId) {
        // Not on a conversation page — clean up if previously active
        _teardown();
        return;
    }

    // Check if the conversation container has rendered
    // Use the platform adapter to look for user messages
    const messageElements = currentPlatform.getUserMessages();

    if (messageElements.length === 0 && attempt < MAX_INIT_RETRIES) {
        // Messages haven't loaded yet — retry after a short delay
        setTimeout(() => _tryInit(attempt + 1), RETRY_INTERVAL_MS);
        return;
    }

    if (messageElements.length === 0) {
        // Fallback guard to detect DOM breakage instead of silently failing
        console.warn('ThreadMap: No user messages found — DOM structure may have changed for', currentPlatform.name);
        return;
    }

    // Initialize (or re-initialize for a new chat)
    _activate(chatId);
}

/**
 * Activates the TOC for a specific chat.
 *
 * @param {string} chatId — The chat UUID.
 */
function _activate(chatId) {
    // If already active for this chat, skip
    if (isActive && currentChatId === chatId) return;

    // Check if enabled
    if (!getSetting('enabled')) return;

    // Teardown previous state if switching chats
    if (isActive) {
        _teardown();
    }

    currentChatId = chatId;
    isActive = true;
    tocItemCount = 0;

    // Mount the UI panel (pass platform for empty state text)
    createPanel(currentPlatform);

    // Perform initial scan of existing messages
    const existingItems = scanAllUserMessages();
    tocItemCount = existingItems.length;
    renderTOC(existingItems);

    // Start observing for new messages
    startObserving((newItems) => {
        for (const item of newItems) {
            tocItemCount++;
            addTOCItem(item, tocItemCount);
        }
    });
}

/**
 * Public function: re-scans all user messages and rebuilds the TOC.
 * Called by the refresh button in the UI panel.
 */
function refreshTOC() {
    if (!isActive) {
        // If not active, try full init
        _tryInit(0);
        return;
    }

    // Reset seen messages and re-scan everything
    resetSeenMessages();
    const items = scanAllUserMessages();
    tocItemCount = items.length;
    renderTOC(items);
}

/**
 * Cleans up the extension state (observer, UI, tracking).
 */
function _teardown() {
    stopObserving();
    destroyPanel();
    resetSeenMessages();

    isActive = false;
    currentChatId = null;
    tocItemCount = 0;
}

/**
 * Handles SPA navigation events.
 * Tears down the current state and re-initializes.
 */
function _handleNavigation() {
    _teardown();

    // Give the new page time to render
    setTimeout(() => {
        _tryInit(0);
    }, INIT_DELAY_MS);
}

// ──────────────────────────────────────────────
// Bootstrap
// ──────────────────────────────────────────────

// Start the extension
main();
