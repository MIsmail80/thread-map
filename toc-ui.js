/**
 * toc-ui.js — Shadow DOM floating panel for ChatGPT Auto TOC
 *
 * Creates a fully isolated UI (Shadow DOM) with:
 *   - Toggle button (right side, vertically centered)
 *   - Slide-in panel with scrollable TOC list
 *   - Click-to-scroll with temporary message highlighting
 *   - Automatic dark/light theme detection
 *
 * PRIVACY: No data leaves the browser. All processing is local.
 */

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

/** Duration (ms) for the message highlight animation */
const HIGHLIGHT_DURATION_MS = 2000;

/** CSS class applied to host element for dark theme */
const DARK_THEME_CLASS = 'dark-theme';

/** Interval (ms) to check for theme changes on the host page */
const THEME_CHECK_INTERVAL_MS = 1000;

/**
 * Pre-resolve the styles.css URL at script load time.
 * chrome.runtime is guaranteed valid when the script first executes,
 * but can become undefined later if the extension is reloaded.
 */
const STYLES_CSS_URL = (() => {
    try {
        return chrome.runtime.getURL('styles.css');
    } catch (e) {
        return null;
    }
})();

/**
 * Pre-resolve the logo URL at script load time.
 */
const LOGO_URL = (() => {
    try {
        return chrome.runtime.getURL('icons/icon-32.png');
    } catch (e) {
        return null;
    }
})();

// ──────────────────────────────────────────────
// Module State
// ──────────────────────────────────────────────

/** @type {ShadowRoot|null} */
let shadowRoot = null;

/** @type {HTMLElement|null} */
let hostElement = null;

/** @type {HTMLElement|null} */
let tocListElement = null;

/** @type {HTMLElement|null} */
let panelElement = null;

/** @type {HTMLElement|null} */
let toggleBtnElement = null;

/** @type {HTMLElement|null} */
let emptyStateElement = null;

/** @type {HTMLElement|null} */
let listContainerElement = null;

/** @type {number|null} */
let themeCheckTimer = null;

/** @type {HTMLElement|null} Currently highlighted message element */
let currentHighlight = null;

/** @type {number|null} Timer for removing highlight */
let highlightTimer = null;

/** @type {HTMLElement|null} LTR direction button */
let ltrBtnElement = null;

/** @type {HTMLElement|null} RTL direction button */
let rtlBtnElement = null;

// ──────────────────────────────────────────────
// Panel Creation
// ──────────────────────────────────────────────

/**
 * Creates and mounts the TOC panel inside a Shadow DOM.
 * Idempotent — calling it again does nothing if already mounted.
 */
function createPanel() {
    if (hostElement) return; // Already created

    // Create host container
    hostElement = document.createElement('div');
    hostElement.id = 'chatgpt-auto-toc-host';
    hostElement.setAttribute('data-chatgpt-auto-toc', 'true');
    // Hide initially to prevent FOUC (Flash of Unstyled Content) before CSS loads
    hostElement.style.display = 'none';

    // Attach closed Shadow DOM for full encapsulation
    shadowRoot = hostElement.attachShadow({ mode: 'closed' });

    // Load styles.css into Shadow DOM using the pre-resolved URL
    if (STYLES_CSS_URL) {
        let isLoaded = false;
        const showHost = () => {
            if (isLoaded) return;
            isLoaded = true;
            // Restore visibility once styles are loaded
            // Use requestAnimationFrame to ensure styles apply before paint
            requestAnimationFrame(() => {
                hostElement.style.display = '';
                // Add 'ready' class on the next frame so transitions are enabled
                // AFTER the element has its initial layout from styles.css
                requestAnimationFrame(() => {
                    if (panelElement) panelElement.classList.add('ready');
                });
            });
        };

        const linkEl = document.createElement('link');
        linkEl.rel = 'stylesheet';
        linkEl.href = STYLES_CSS_URL;
        linkEl.onload = showHost;
        linkEl.onerror = showHost; // Only fallback if CSS objectively fails to load

        shadowRoot.appendChild(linkEl);
    } else {
        hostElement.style.display = '';
    }

    // Build DOM structure
    _buildToggleButton();
    _buildPanel();

    // Mount to page
    document.body.appendChild(hostElement);

    // Start theme detection
    _detectTheme();
    themeCheckTimer = setInterval(_detectTheme, THEME_CHECK_INTERVAL_MS);
}

/**
 * Completely removes the TOC panel from the page and cleans up.
 */
function destroyPanel() {
    if (themeCheckTimer) {
        clearInterval(themeCheckTimer);
        themeCheckTimer = null;
    }

    if (highlightTimer) {
        clearTimeout(highlightTimer);
        highlightTimer = null;
    }

    if (currentHighlight) {
        _removeHighlight(currentHighlight);
        currentHighlight = null;
    }

    if (hostElement && hostElement.parentNode) {
        hostElement.parentNode.removeChild(hostElement);
    }

    shadowRoot = null;
    hostElement = null;
    tocListElement = null;
    panelElement = null;
    toggleBtnElement = null;
    emptyStateElement = null;
    listContainerElement = null;
    ltrBtnElement = null;
    rtlBtnElement = null;
}

// ──────────────────────────────────────────────
// DOM Building (private)
// ──────────────────────────────────────────────

/** Builds the floating toggle button */
function _buildToggleButton() {
    toggleBtnElement = document.createElement('button');
    toggleBtnElement.className = 'toc-toggle-btn';
    toggleBtnElement.setAttribute('aria-label', 'Open Table of Contents');
    toggleBtnElement.setAttribute('title', 'Table of Contents');
    toggleBtnElement.textContent = '☰';

    let isDragging = false;
    let startY = 0;
    let startTop = 0;
    let hasMoved = false;

    function onMouseMove(e) {
        if (!isDragging) return;
        const deltaY = e.clientY - startY;
        if (Math.abs(deltaY) > 3) {
            hasMoved = true;
        }
        if (hasMoved) {
            let newTop = startTop + deltaY;
            const maxTop = window.innerHeight - toggleBtnElement.offsetHeight;
            if (newTop < 0) newTop = 0;
            if (newTop > maxTop) newTop = maxTop;
            toggleBtnElement.style.top = newTop + 'px';
        }
    }

    function onMouseUp(e) {
        if (isDragging) {
            isDragging = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }
    }

    toggleBtnElement.addEventListener('mousedown', (e) => {
        // Only react to left click
        if (e.button !== 0) return;

        isDragging = true;
        hasMoved = false;
        startY = e.clientY;
        const rect = toggleBtnElement.getBoundingClientRect();
        startTop = rect.top;

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        e.preventDefault();
    });

    toggleBtnElement.addEventListener('click', (e) => {
        if (hasMoved) {
            e.preventDefault();
            e.stopPropagation();
            hasMoved = false;
            return;
        }
        _openPanel();
    });

    shadowRoot.appendChild(toggleBtnElement);
}

/** Builds the slide-in panel */
function _buildPanel() {
    panelElement = document.createElement('div');
    panelElement.className = 'toc-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'toc-header';

    // Brand container (logo + title)
    const brandContainer = document.createElement('div');
    brandContainer.className = 'toc-brand';

    if (LOGO_URL) {
        const logo = document.createElement('img');
        logo.src = LOGO_URL;
        logo.className = 'toc-logo';
        logo.alt = 'Thread Map Logo';
        brandContainer.appendChild(logo);
    }

    const title = document.createElement('span');
    title.className = 'toc-title';
    title.textContent = 'Thread Map';

    brandContainer.appendChild(title);

    // Header action buttons container
    const headerActions = document.createElement('div');
    headerActions.className = 'toc-header-actions';

    // ── Direction toggle buttons (LTR / RTL) ──
    const dirGroup = document.createElement('div');
    dirGroup.className = 'toc-dir-group';

    ltrBtnElement = _createDirButton('ltr', 'Left to Right');
    rtlBtnElement = _createDirButton('rtl', 'Right to Left');

    // LTR is active by default
    ltrBtnElement.classList.add('active');

    ltrBtnElement.addEventListener('click', () => {
        _setDirection('ltr', ltrBtnElement, rtlBtnElement);
    });
    rtlBtnElement.addEventListener('click', () => {
        _setDirection('rtl', rtlBtnElement, ltrBtnElement);
    });

    dirGroup.appendChild(ltrBtnElement);
    dirGroup.appendChild(rtlBtnElement);

    // Refresh button — re-scans all user messages
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'toc-refresh-btn';
    refreshBtn.setAttribute('aria-label', 'Refresh Table of Contents');
    refreshBtn.setAttribute('title', 'Refresh');
    // Use innerHTML for the refresh icon — textContent can strip special Unicode in some contexts
    refreshBtn.innerHTML = '&#x21bb;';
    refreshBtn.addEventListener('click', () => {
        // Call the global refreshTOC from content.js
        if (typeof refreshTOC === 'function') {
            refreshTOC();
        }
        // Brief visual feedback: spin animation
        refreshBtn.classList.add('spinning');
        setTimeout(() => refreshBtn.classList.remove('spinning'), 500);
    });

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toc-close-btn';
    closeBtn.setAttribute('aria-label', 'Close Table of Contents');
    closeBtn.innerHTML = '&#x2715;';
    closeBtn.addEventListener('click', () => {
        _closePanel();
    });

    // Only close button goes in header now
    headerActions.appendChild(closeBtn);

    header.appendChild(brandContainer);
    header.appendChild(headerActions);
    panelElement.appendChild(header);

    // Toolbar (below header) — holds direction toggle & refresh
    const toolbar = document.createElement('div');
    toolbar.className = 'toc-toolbar';
    toolbar.appendChild(dirGroup);
    toolbar.appendChild(refreshBtn);
    panelElement.appendChild(toolbar);

    // Scrollable list container
    listContainerElement = document.createElement('div');
    listContainerElement.className = 'toc-list-container';

    // "Contents" section label above the list
    const sectionLabel = document.createElement('div');
    sectionLabel.className = 'toc-section-label';
    sectionLabel.textContent = 'Contents';

    tocListElement = document.createElement('ol');
    tocListElement.className = 'toc-list';

    // Empty state
    emptyStateElement = document.createElement('div');
    emptyStateElement.className = 'toc-empty';
    emptyStateElement.textContent = 'No user messages yet.';

    listContainerElement.appendChild(sectionLabel);
    listContainerElement.appendChild(tocListElement);
    listContainerElement.appendChild(emptyStateElement);
    panelElement.appendChild(listContainerElement);

    shadowRoot.appendChild(panelElement);
}

/**
 * Creates a direction toggle button with 3-line alignment icon.
 *
 * @param {'ltr'|'rtl'} dir — Direction this button represents.
 * @param {string} label — Accessible label / tooltip.
 * @returns {HTMLElement}
 */
function _createDirButton(dir, label) {
    const btn = document.createElement('button');
    btn.className = 'toc-dir-btn';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    btn.dataset.dir = dir;

    // Build 3-line alignment icon
    const icon = document.createElement('span');
    icon.className = `toc-dir-icon toc-dir-icon-${dir}`;

    for (let i = 0; i < 3; i++) {
        icon.appendChild(document.createElement('span'));
    }

    btn.appendChild(icon);
    return btn;
}

/**
 * Sets the text direction on the panel body content.
 *
 * @param {'ltr'|'rtl'} dir — The direction to apply.
 * @param {HTMLElement} activeBtn — The button being activated.
 * @param {HTMLElement} inactiveBtn — The other button to deactivate.
 */
function _setDirection(dir, activeBtn, inactiveBtn) {
    if (!listContainerElement) return;

    listContainerElement.setAttribute('dir', dir);
    activeBtn.classList.add('active');
    inactiveBtn.classList.remove('active');
}

/**
 * Auto-detects text direction from user messages and
 * sets the panel direction + active button accordingly.
 */
function _autoDetectDirection() {
    if (!ltrBtnElement || !rtlBtnElement) return;

    const dir = detectTextDirection();

    if (dir === 'rtl') {
        _setDirection('rtl', rtlBtnElement, ltrBtnElement);
    } else {
        _setDirection('ltr', ltrBtnElement, rtlBtnElement);
    }
}

// ──────────────────────────────────────────────
// Panel Open/Close
// ──────────────────────────────────────────────

function _openPanel() {
    if (panelElement) panelElement.classList.add('open');
    if (toggleBtnElement) toggleBtnElement.classList.add('hidden');
}

function _closePanel() {
    if (panelElement) panelElement.classList.remove('open');
    if (toggleBtnElement) toggleBtnElement.classList.remove('hidden');
}

// ──────────────────────────────────────────────
// TOC Rendering
// ──────────────────────────────────────────────

/**
 * Renders the full TOC list from an array of items.
 * Replaces any existing items.
 *
 * @param {Array<{id: string, label: string, element: HTMLElement}>} items
 */
function renderTOC(items) {
    if (!tocListElement) return;

    // Clear existing items
    tocListElement.innerHTML = '';

    if (items.length === 0) {
        _showEmptyState();
        return;
    }

    _hideEmptyState();

    items.forEach((item, index) => {
        const li = _createTOCItem(item, index + 1);
        tocListElement.appendChild(li);
    });

    // Auto-detect language direction after full render
    _autoDetectDirection();
}

/**
 * Appends a single item to the TOC list (incremental update).
 *
 * @param {{id: string, label: string, element: HTMLElement}} item
 * @param {number} index — 1-based index number for the item.
 */
function addTOCItem(item, index) {
    if (!tocListElement) return;

    _hideEmptyState();

    const li = _createTOCItem(item, index);
    tocListElement.appendChild(li);
}

/**
 * Clears all TOC items and shows the empty state.
 */
function clearTOC() {
    if (tocListElement) {
        tocListElement.innerHTML = '';
    }
    _showEmptyState();
}

// ──────────────────────────────────────────────
// Item Creation (private)
// ──────────────────────────────────────────────

/**
 * Creates a single TOC list item element.
 *
 * @param {{id: string, label: string, element: HTMLElement}} item
 * @param {number} number — Display number (1-based).
 * @returns {HTMLElement} The <li> element.
 */
function _createTOCItem(item, number) {
    const li = document.createElement('li');
    li.className = 'toc-item';

    const btn = document.createElement('button');
    btn.className = 'toc-item-btn';

    const numSpan = document.createElement('span');
    numSpan.className = 'toc-item-number';
    numSpan.textContent = `${number}.`;

    const labelSpan = document.createElement('span');
    labelSpan.className = 'toc-item-label';
    labelSpan.textContent = item.label;

    btn.appendChild(numSpan);
    btn.appendChild(labelSpan);

    // Click handler: smooth scroll + highlight
    btn.addEventListener('click', () => {
        _scrollToMessage(item.element);
    });

    li.appendChild(btn);
    return li;
}

// ──────────────────────────────────────────────
// Scroll + Highlight
// ──────────────────────────────────────────────

/**
 * Smoothly scrolls to a message element and temporarily highlights it.
 *
 * @param {HTMLElement} element — The message container to scroll to.
 */
function _scrollToMessage(element) {
    if (!element || !document.contains(element)) return;

    // Remove any active highlight first
    if (currentHighlight) {
        _removeHighlight(currentHighlight);
    }

    // Smooth scroll into the center of the viewport
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Apply highlight animation
    element.style.animation = `toc-highlight-fade ${HIGHLIGHT_DURATION_MS}ms ease-out`;
    element.style.borderRadius = '8px';
    currentHighlight = element;

    // Inject the keyframe animation into the host page if not already done
    _ensureHighlightStyles();

    // Remove highlight after animation completes
    if (highlightTimer) clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => {
        _removeHighlight(element);
        currentHighlight = null;
    }, HIGHLIGHT_DURATION_MS);
}

/** Track if highlight styles have been injected into the host page */
let highlightStylesInjected = false;

/**
 * Injects the highlight keyframe animation into the host page's document.
 * This is necessary because the target message element lives outside the Shadow DOM.
 */
function _ensureHighlightStyles() {
    if (highlightStylesInjected) return;

    const style = document.createElement('style');
    style.setAttribute('data-chatgpt-auto-toc', 'highlight');
    style.textContent = `
    @keyframes toc-highlight-fade {
      0% {
        outline: 2px solid #6366f1;
        outline-offset: 4px;
        background-color: rgba(99, 102, 241, 0.08);
      }
      70% {
        outline: 2px solid #6366f1;
        outline-offset: 4px;
        background-color: rgba(99, 102, 241, 0.08);
      }
      100% {
        outline: 2px solid transparent;
        outline-offset: 4px;
        background-color: transparent;
      }
    }
  `;
    document.head.appendChild(style);
    highlightStylesInjected = true;
}

/**
 * Removes highlight styles from a message element.
 * @param {HTMLElement} el
 */
function _removeHighlight(el) {
    if (!el) return;
    el.style.animation = '';
    el.style.borderRadius = '';
}

// ──────────────────────────────────────────────
// Empty State
// ──────────────────────────────────────────────

function _showEmptyState() {
    if (emptyStateElement) emptyStateElement.style.display = 'block';
}

function _hideEmptyState() {
    if (emptyStateElement) emptyStateElement.style.display = 'none';
}

// ──────────────────────────────────────────────
// Theme Detection
// ──────────────────────────────────────────────

/**
 * Detects whether ChatGPT is in dark mode and updates the host class.
 *
 * Strategy:
 *   1. Check for `dark` class on <html> element (ChatGPT convention).
 *   2. Fallback to `prefers-color-scheme` media query.
 */
function _detectTheme() {
    if (!hostElement) return;

    const htmlEl = document.documentElement;
    const isDark =
        htmlEl.classList.contains('dark') ||
        htmlEl.getAttribute('data-theme') === 'dark' ||
        htmlEl.style.colorScheme === 'dark' ||
        window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (isDark) {
        hostElement.classList.add(DARK_THEME_CLASS);
    } else {
        hostElement.classList.remove(DARK_THEME_CLASS);
    }
}
