/**
 * platform-detector.js — Platform detection for ThreadMap
 *
 * Identifies the current AI chat platform based on hostname
 * and returns the appropriate platform adapter.
 */

const PLATFORM_HOSTNAME_MAP = {
    'chatgpt.com': 'chatgpt',
    'chat.openai.com': 'chatgpt',
    'gemini.google.com': 'gemini',
    'claude.ai': 'claude',
};

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

    // Attach capabilities to the adapter
    if (window.ThreadMapPlatformCapabilities && window.ThreadMapPlatformCapabilities[platformKey]) {
        adapter.capabilities = window.ThreadMapPlatformCapabilities[platformKey];
    } else {
        adapter.capabilities = {};
    }

    return adapter;
}

function getPlatformKey() {
    return PLATFORM_HOSTNAME_MAP[window.location.hostname] || null;
}
