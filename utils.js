/**
 * utils.js — Pure utility functions for ThreadMap
 *
 * Platform-agnostic helpers used by all modules.
 *
 * PRIVACY: No data leaves the browser. All processing is local.
 */

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

/** Maximum label length before truncation */
const MAX_LABEL_LENGTH = 60;

/** Suffix appended when a label is truncated */
const TRUNCATION_SUFFIX = '…';

// ──────────────────────────────────────────────
// Text Extraction
// ──────────────────────────────────────────────

/**
 * Extracts the first non-empty line of visible text from a DOM element.
 *
 * Strategy:
 *   1. Get innerText (respects visibility and layout).
 *   2. Split by newline characters.
 *   3. Trim each line and skip empty ones.
 *   4. Return the first non-empty line.
 *
 * @param {HTMLElement} element — The message container element.
 * @returns {string|null} The first line of text, or null if none found.
 */
function extractFirstLine(element) {
  if (!element) return null;

  // innerText respects CSS visibility and produces layout-aware text
  const text = element.innerText;
  if (!text) return null;

  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return null;
}

// ──────────────────────────────────────────────
// Label Trimming
// ──────────────────────────────────────────────

/**
 * Trims a string to a maximum length, appending a suffix if truncated.
 *
 * @param {string} text — The raw text to trim.
 * @param {number} [max=MAX_LABEL_LENGTH] — Maximum allowed characters.
 * @returns {string} The trimmed label.
 */
function trimLabel(text, max) {
  // Use setting if available, otherwise fall back to constant
  if (max === undefined) {
    max = (typeof getSetting === 'function') ? getSetting('labelMaxLength') : MAX_LABEL_LENGTH;
  }
  if (!text) return '';

  if (text.length <= max) {
    return text;
  }

  return text.slice(0, max).trimEnd() + TRUNCATION_SUFFIX;
}

// ──────────────────────────────────────────────
// Hashing
// ──────────────────────────────────────────────

/**
 * Simple string hash for generating synthetic IDs.
 * Not cryptographic — just needs to be deterministic and fast.
 * Used by platform adapters as a fallback for message ID generation.
 *
 * @param {string} str
 * @returns {string}
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

// ──────────────────────────────────────────────
// Debounce
// ──────────────────────────────────────────────

/**
 * Creates a debounced version of a function.
 * The wrapped function delays invocation until `ms` milliseconds
 * have passed without another call.
 *
 * @param {Function} fn — The function to debounce.
 * @param {number} ms — Delay in milliseconds.
 * @returns {Function} The debounced wrapper.
 */
function debounce(fn, ms) {
  let timerId = null;

  return function debounced(...args) {
    clearTimeout(timerId);
    timerId = setTimeout(() => fn.apply(this, args), ms);
  };
}

// ──────────────────────────────────────────────
// Text Direction Detection (RTL / LTR)
// ──────────────────────────────────────────────

/** Regex matching RTL Unicode script characters */
const RTL_CHAR_REGEX_GLOBAL = /[\u0591-\u07FF\u200F\u202B\u202E\uFB1D-\uFDFD\uFE70-\uFEFC]/g;
const LTR_CHAR_REGEX_GLOBAL = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/g;

/**
 * Detects the dominant text direction of all user messages on the page.
 * Uses the platform adapter to get user messages (platform-agnostic).
 *
 * @returns {'rtl'|'ltr'} The dominant direction.
 */
function detectTextDirection() {
  // Get user messages via the current platform adapter
  const platform = typeof detectPlatform === 'function' ? detectPlatform() : null;
  const els = platform ? platform.getUserMessages() : [];

  let rtl = 0, ltr = 0;

  for (const el of els) {
    const text = el.innerText || '';
    const rm = text.match(RTL_CHAR_REGEX_GLOBAL);
    const lm = text.match(LTR_CHAR_REGEX_GLOBAL);
    rtl += rm ? rm.length : 0;
    ltr += lm ? lm.length : 0;
  }

  return rtl > ltr ? 'rtl' : 'ltr';
}
