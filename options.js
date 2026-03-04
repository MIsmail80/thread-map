/**
 * options.js — Script for the Thread Map options page.
 *
 * Reads and writes settings to the same chrome.storage.local key
 * used by the content script, so changes here sync immediately
 * to any open ChatGPT tabs via chrome.storage.onChanged.
 */

const SETTINGS_STORAGE_KEY = 'threadMapSettings';

const DEFAULTS = {
    enabled: true,
    highlightOnScroll: true,
    themeMode: 'auto',
    autoDetectDirection: true,
    labelMaxLength: 60,
    autoOpenPanel: false,
    panelPosition: 'right',
    panelWidth: 280,
};

// Toggle settings (checkbox)
const TOGGLE_KEYS = ['enabled', 'highlightOnScroll', 'autoDetectDirection', 'autoOpenPanel'];

// Select settings (dropdown)
const SELECT_KEYS = ['themeMode', 'labelMaxLength', 'panelPosition', 'panelWidth'];

/**
 * Load settings from storage and populate the UI.
 */
function init() {
    chrome.storage.local.get([SETTINGS_STORAGE_KEY], (result) => {
        const settings = { ...DEFAULTS, ...(result[SETTINGS_STORAGE_KEY] || {}) };

        // Populate toggles
        for (const key of TOGGLE_KEYS) {
            const el = document.getElementById(`setting-${key}`);
            if (el) el.checked = settings[key];
        }

        // Populate selects
        for (const key of SELECT_KEYS) {
            const el = document.getElementById(`setting-${key}`);
            if (el) el.value = String(settings[key]);
        }

        // Show version
        const versionEl = document.getElementById('version-display');
        if (versionEl) {
            try {
                const manifest = chrome.runtime.getManifest();
                versionEl.textContent = 'Thread Map v' + manifest.version;
            } catch (e) {
                versionEl.textContent = 'Thread Map v1.0.0';
            }
        }
    });
}

/**
 * Save a single setting change.
 */
function saveSetting(key, value) {
    chrome.storage.local.get([SETTINGS_STORAGE_KEY], (result) => {
        const current = { ...DEFAULTS, ...(result[SETTINGS_STORAGE_KEY] || {}) };
        current[key] = value;
        chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: current });
    });
}

// Bind event listeners
document.addEventListener('DOMContentLoaded', () => {
    init();

    for (const key of TOGGLE_KEYS) {
        const el = document.getElementById(`setting-${key}`);
        if (el) {
            el.addEventListener('change', () => {
                saveSetting(key, el.checked);
            });
        }
    }

    for (const key of SELECT_KEYS) {
        const el = document.getElementById(`setting-${key}`);
        if (el) {
            el.addEventListener('change', () => {
                let val = el.value;
                if (key === 'labelMaxLength' || key === 'panelWidth') val = parseInt(val, 10);
                saveSetting(key, val);
            });
        }
    }
});
