/**
 * platform-detector.js — Platform detection for ThreadMap
 *
 * Identifies the current AI chat platform based on hostname
 * and returns the appropriate platform adapter.
 *
 * Supported platforms:
 *   - ChatGPT (chatgpt.com, chat.openai.com)
 *   - Gemini  (gemini.google.com)
 *   - Claude  (claude.ai)
 *
 * PRIVACY: No data leaves the browser. All processing is local.
 */

// ──────────────────────────────────────────────
// Hostname → Platform Key Mapping
// ──────────────────────────────────────────────

/**
 * Maps hostnames to platform adapter keys.
 * The keys must match property names in window.ThreadMapPlatforms.
 */
const PLATFORM_HOSTNAME_MAP = {
    'chatgpt.com': 'chatgpt',
    'chat.openai.com': 'chatgpt',
    'gemini.google.com': 'gemini',
    'claude.ai': 'claude',
};

// ──────────────────────────────────────────────
// Detection
// ──────────────────────────────────────────────

/**
 * Detects the current platform based on the page hostname.
 * Returns the matching platform adapter object, or null if
 * the hostname is not recognized.
 *
 * Usage:
 *   const platform = detectPlatform();
 *   if (platform) {
 *       const messages = platform.getUserMessages();
 *   }
 *
 * @returns {Object|null} The platform adapter, or null.
 */
function detectPlatform() {
    const hostname = window.location.hostname;
    const platformKey = PLATFORM_HOSTNAME_MAP[hostname];

    if (!platformKey) {
        console.warn('ThreadMap: Unsupported platform —', hostname);
        return null;
    }

    const platforms = window.ThreadMapPlatforms || {};
    const adapter = platforms[platformKey];

    if (!adapter) {
        console.warn('ThreadMap: Platform adapter not loaded —', platformKey);
        return null;
    }

    return adapter;
}

/**
 * Returns the platform key (e.g., 'chatgpt', 'gemini', 'claude')
 * for the current hostname, or null if not recognized.
 *
 * @returns {string|null}
 */
function getPlatformKey() {
    return PLATFORM_HOSTNAME_MAP[window.location.hostname] || null;
}
