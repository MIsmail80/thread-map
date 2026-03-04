/**
 * settings.js — Global settings manager for Thread Map
 *
 * Manages user preferences via chrome.storage.local.
 * Settings are loaded once at startup into an in-memory cache
 * and kept in sync via chrome.storage.onChanged.
 *
 * PRIVACY: All settings are stored locally. No data leaves the browser.
 */

// ──────────────────────────────────────────────
// Defaults
// ──────────────────────────────────────────────

/**
 * Default values for all settings.
 * Any missing keys in storage will fall back to these.
 */
const SETTINGS_DEFAULTS = {
    enabled: true,
    highlightOnScroll: true,
    themeMode: 'auto',   // 'auto' | 'light' | 'dark'
    autoDetectDirection: true,
    labelMaxLength: 60,       // 30 | 60 | 90 | 120
    autoOpenPanel: false,
    panelPosition: 'right',  // 'right' | 'left'
    panelWidth: 280,      // 240 | 280 | 320 | 360
};

/** Storage key used in chrome.storage.local */
const SETTINGS_STORAGE_KEY = 'threadMapSettings';

// ──────────────────────────────────────────────
// In-Memory Cache
// ──────────────────────────────────────────────

/** @type {Object} Cached copy of current settings */
let _settingsCache = { ...SETTINGS_DEFAULTS };

/** @type {boolean} Whether settings have been loaded from storage */
let _settingsLoaded = false;

/** @type {Array<Function>} Listeners notified on settings change */
const _settingsListeners = [];

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Loads settings from chrome.storage.local into the in-memory cache.
 * Merges stored values with defaults so new settings always have a value.
 *
 * @returns {Promise<Object>} The resolved settings object.
 */
function loadSettings() {
    return new Promise((resolve) => {
        if (!chrome?.storage?.local) {
            _settingsLoaded = true;
            resolve({ ..._settingsCache });
            return;
        }

        chrome.storage.local.get([SETTINGS_STORAGE_KEY], (result) => {
            const stored = result[SETTINGS_STORAGE_KEY] || {};
            _settingsCache = { ...SETTINGS_DEFAULTS, ...stored };
            _settingsLoaded = true;
            resolve({ ..._settingsCache });
        });
    });
}

/**
 * Saves the provided settings object to chrome.storage.local
 * and updates the in-memory cache.
 *
 * @param {Object} settings — Full or partial settings object to save.
 * @returns {Promise<void>}
 */
function saveSettings(settings) {
    // Merge with existing cache so partial updates work
    _settingsCache = { ...SETTINGS_DEFAULTS, ..._settingsCache, ...settings };

    return new Promise((resolve) => {
        if (!chrome?.storage?.local) {
            _notifyListeners(_settingsCache);
            resolve();
            return;
        }

        chrome.storage.local.set(
            { [SETTINGS_STORAGE_KEY]: { ..._settingsCache } },
            () => {
                _notifyListeners(_settingsCache);
                resolve();
            }
        );
    });
}

/**
 * Returns the current value of a single setting.
 * Uses the in-memory cache (synchronous).
 *
 * @param {string} key — The setting key.
 * @returns {*} The setting value, or the default if not loaded yet.
 */
function getSetting(key) {
    return _settingsCache.hasOwnProperty(key)
        ? _settingsCache[key]
        : SETTINGS_DEFAULTS[key];
}

/**
 * Returns a copy of all current settings.
 *
 * @returns {Object}
 */
function getAllSettings() {
    return { ..._settingsCache };
}

/**
 * Registers a callback to be invoked whenever settings change.
 *
 * @param {Function} callback — Receives the full settings object.
 */
function onSettingsChanged(callback) {
    if (typeof callback === 'function') {
        _settingsListeners.push(callback);
    }
}

// ──────────────────────────────────────────────
// Internal Helpers
// ──────────────────────────────────────────────

/**
 * Notifies all registered listeners of a settings change.
 * @param {Object} settings
 */
function _notifyListeners(settings) {
    for (const listener of _settingsListeners) {
        try {
            listener({ ...settings });
        } catch (e) {
            // Don't let a bad listener break others
        }
    }
}

// ──────────────────────────────────────────────
// Cross-Tab Sync
// ──────────────────────────────────────────────

// Listen for storage changes from other tabs / the extension popup
if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (!changes[SETTINGS_STORAGE_KEY]) return;

        const newValue = changes[SETTINGS_STORAGE_KEY].newValue || {};
        _settingsCache = { ...SETTINGS_DEFAULTS, ...newValue };
        _notifyListeners(_settingsCache);
    });
}
