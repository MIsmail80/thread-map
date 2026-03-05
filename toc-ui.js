/**
 * toc-ui.js — Shadow DOM floating panel for ThreadMap
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

/** @type {HTMLElement|null} */
let searchInputElement = null;

/** @type {HTMLElement|null} */
let searchContainerElement = null;

/** @type {HTMLElement|null} */
let searchNoResultsElement = null;

/** @type {HTMLElement|null} */
let searchClearBtnElement = null;

/** @type {HTMLElement|null} */
let progressIndicatorElement = null;

/** @type {MutationObserver|null} Observer for html theme attributes */
let themeObserver = null;

/** @type {HTMLElement|null} Currently highlighted message element */
let currentHighlight = null;

/** @type {number|null} Timer for removing highlight */
let highlightTimer = null;

/** @type {HTMLElement|null} LTR direction button */
let ltrBtnElement = null;

/** @type {HTMLElement|null} RTL direction button */
let rtlBtnElement = null;

/** @type {HTMLElement|null} Container holding all the sliding pages */
let pagesContainerElement = null;

/** @type {HTMLElement|null} The main list page container */
let mainPageElement = null;

/** @type {HTMLElement|null} Settings overlay page */
let settingsOverlayElement = null;

/** @type {HTMLElement|null} Settings gear button */
let settingsBtnElement = null;

/** @type {Function|null} Reference to the global keyboard event listener */
let keyboardShortcutListener = null;

/** @type {Object|null} Current platform adapter for empty state text */
let _currentPanelPlatform = null;

/** @type {IntersectionObserver|null} Observer for scrolling TOC highlighting */
let scrollObserver = null;

/** @type {Map<Element, HTMLElement>} Map of message elements to their TOC item buttons */
let messageToTOCItemMap = new Map();

/** @type {Set<Element>} Currently intersecting messages */
let currentlyIntersecting = new Set();

// ──────────────────────────────────────────────
// Panel Creation
// ──────────────────────────────────────────────

/**
 * Creates and mounts the TOC panel inside a Shadow DOM.
 * Idempotent — calling it again does nothing if already mounted.
 */
function createPanel(platform) {
    if (hostElement) return; // Already created

    // Store platform reference for empty state text
    _currentPanelPlatform = platform || null;

    // Create host container
    hostElement = document.createElement('div');
    hostElement.id = 'threadmap-toc-host';
    hostElement.setAttribute('data-threadmap-toc', 'true');
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

    // Apply panel position and width from settings
    _applyPanelPosition(getSetting('panelPosition'));
    _applyPanelWidth(getSetting('panelWidth'));

    // Mount to page
    document.body.appendChild(hostElement);

    // Start theme detection
    _detectTheme();
    if (!themeObserver) {
        themeObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' &&
                    (mutation.attributeName === 'class' || mutation.attributeName === 'data-theme')) {
                    _detectTheme();
                    break;
                }
            }
        });
        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class', 'data-theme']
        });
    }

    // Auto-open panel if setting is enabled
    if (getSetting('autoOpenPanel')) {
        _openPanel();
    }

    // Add keyboard shortcut listener (Alt + T)
    if (!keyboardShortcutListener) {
        keyboardShortcutListener = _handleKeyboardShortcut;
        document.addEventListener('keydown', keyboardShortcutListener);
    }
}

/**
 * Completely removes the TOC panel from the page and cleans up.
 */
function destroyPanel() {
    if (themeObserver) {
        themeObserver.disconnect();
        themeObserver = null;
    }

    if (highlightTimer) {
        clearTimeout(highlightTimer);
        highlightTimer = null;
    }

    if (currentHighlight) {
        _removeHighlight(currentHighlight);
        currentHighlight = null;
    }

    if (keyboardShortcutListener) {
        document.removeEventListener('keydown', keyboardShortcutListener);
        keyboardShortcutListener = null;
    }

    if (scrollObserver) {
        scrollObserver.disconnect();
        scrollObserver = null;
    }
    messageToTOCItemMap.clear();
    currentlyIntersecting.clear();

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
    progressIndicatorElement = null;
    searchInputElement = null;
    searchContainerElement = null;
    searchNoResultsElement = null;
    searchClearBtnElement = null;
    ltrBtnElement = null;
    rtlBtnElement = null;
    pagesContainerElement = null;
    mainPageElement = null;
    settingsOverlayElement = null;
    settingsBtnElement = null;
    _currentPanelPlatform = null;
}

// ──────────────────────────────────────────────
// DOM Building (private)
// ──────────────────────────────────────────────

/** Builds the floating toggle button */
function _buildToggleButton() {
    toggleBtnElement = document.createElement('button');
    toggleBtnElement.className = 'toc-toggle-btn';
    toggleBtnElement.setAttribute('aria-label', 'Open Table of Contents (Alt + T)');
    toggleBtnElement.setAttribute('title', 'Table of Contents (Alt + T)');
    toggleBtnElement.innerHTML = `
        <span class="toc-drag-arrow up">&#9652;</span>
        <span class="toc-toggle-icon">☰</span>
        <span class="toc-drag-arrow down">&#9662;</span>
    `;

    // Try to load saved vertical position
    if (chrome && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['tocButtonTop'], (result) => {
            if (result.tocButtonTop) {
                toggleBtnElement.style.top = result.tocButtonTop;
            }
        });
    }

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

            // Save new position across chats if moved
            if (hasMoved && chrome && chrome.storage && chrome.storage.local) {
                chrome.storage.local.set({ tocButtonTop: toggleBtnElement.style.top });
            }
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

    // Version badge
    const versionBadge = document.createElement('span');
    versionBadge.className = 'toc-version';
    try {
        const manifest = chrome.runtime.getManifest();
        versionBadge.textContent = 'v' + manifest.version;
    } catch (e) {
        versionBadge.textContent = 'v1.0.0';
    }
    brandContainer.appendChild(versionBadge);

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

    // Settings gear button
    settingsBtnElement = document.createElement('button');
    settingsBtnElement.className = 'toc-settings-btn';
    settingsBtnElement.setAttribute('aria-label', 'Settings');
    settingsBtnElement.setAttribute('title', 'Settings');
    settingsBtnElement.innerHTML = '&#x2699;';
    settingsBtnElement.addEventListener('click', () => {
        _openSettingsOverlay();
    });

    // ── PAGE SYSTEM ──────────────────────────────────
    // Container for all sliding pages
    pagesContainerElement = document.createElement('div');
    pagesContainerElement.className = 'toc-pages-container';

    // Main TOC list page
    mainPageElement = document.createElement('div');
    mainPageElement.className = 'toc-page active'; // active by default
    mainPageElement.id = 'toc-page-main';
    // ──────────────────────────────────────────────

    // Toolbar (below header) — holds direction toggle, refresh & settings
    const toolbar = document.createElement('div');
    toolbar.className = 'toc-toolbar';
    toolbar.appendChild(dirGroup);

    // Right side of toolbar: refresh + settings
    const toolbarRight = document.createElement('div');
    toolbarRight.className = 'toc-toolbar-right';
    toolbarRight.appendChild(refreshBtn);
    toolbarRight.appendChild(settingsBtnElement);
    toolbar.appendChild(toolbarRight);

    // Add toolbar to MAIN PAGE
    mainPageElement.appendChild(toolbar);

    // Search field
    _buildSearchField();
    mainPageElement.appendChild(searchContainerElement);

    // "Contents" section label — fixed above the scrollable list
    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'toc-section-header';
    sectionHeader.setAttribute('dir', 'ltr');

    const sectionLabel = document.createElement('span');
    sectionLabel.className = 'toc-section-label';
    sectionLabel.textContent = 'Contents';

    progressIndicatorElement = document.createElement('span');
    progressIndicatorElement.className = 'toc-progress-indicator';
    progressIndicatorElement.textContent = '';

    sectionHeader.appendChild(sectionLabel);
    sectionHeader.appendChild(progressIndicatorElement);

    // Append section header to MAIN PAGE
    mainPageElement.appendChild(sectionHeader);

    // Scrollable list container (section header is NOT inside here)
    listContainerElement = document.createElement('div');
    listContainerElement.className = 'toc-list-container';

    tocListElement = document.createElement('ol');
    tocListElement.className = 'toc-list';

    // Empty state
    emptyStateElement = document.createElement('div');
    emptyStateElement.className = 'toc-empty';
    const emptyText = (_currentPanelPlatform && _currentPanelPlatform.getEmptyStateText)
        ? _currentPanelPlatform.getEmptyStateText()
        : 'Start a conversation.';
    emptyStateElement.innerHTML = `
        <strong>${emptyText}</strong><br>
        Your prompts will appear here.
    `;

    // Search no-results state (separate from empty state)
    searchNoResultsElement = document.createElement('div');
    searchNoResultsElement.className = 'toc-search-no-results';
    searchNoResultsElement.textContent = 'No matching prompts.';
    searchNoResultsElement.style.display = 'none';

    listContainerElement.appendChild(tocListElement);
    listContainerElement.appendChild(emptyStateElement);
    listContainerElement.appendChild(searchNoResultsElement);

    // Append list container to MAIN PAGE
    mainPageElement.appendChild(listContainerElement);

    // Build settings page overlay
    _buildSettingsOverlay();

    // Append pages to the pages container
    pagesContainerElement.appendChild(mainPageElement);
    pagesContainerElement.appendChild(settingsOverlayElement);

    // Append the pages container to the main panel element
    panelElement.appendChild(pagesContainerElement);

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
// Search Field
// ──────────────────────────────────────────────

/** Builds the search input field */
function _buildSearchField() {
    searchContainerElement = document.createElement('div');
    searchContainerElement.className = 'toc-search-container';

    const searchIcon = document.createElement('span');
    searchIcon.className = 'toc-search-icon';
    searchIcon.textContent = '\uD83D\uDD0E'; // 🔎

    searchInputElement = document.createElement('input');
    searchInputElement.type = 'text';
    searchInputElement.className = 'toc-search-input';
    searchInputElement.placeholder = 'Search prompts...';
    searchInputElement.setAttribute('aria-label', 'Search prompts');

    searchClearBtnElement = document.createElement('button');
    searchClearBtnElement.className = 'toc-search-clear-btn';
    searchClearBtnElement.innerHTML = '&#x2715;';
    searchClearBtnElement.setAttribute('aria-label', 'Clear search');
    searchClearBtnElement.setAttribute('title', 'Clear');
    searchClearBtnElement.style.display = 'none';

    searchClearBtnElement.addEventListener('click', () => {
        searchInputElement.value = '';
        searchClearBtnElement.style.display = 'none';
        _filterTOCItems('');
        searchInputElement.focus();
    });

    searchInputElement.addEventListener('input', () => {
        const query = searchInputElement.value;
        searchClearBtnElement.style.display = query.length > 0 ? '' : 'none';
        _filterTOCItems(query);
    });

    // Prevent host page from stealing focus when typing in the search box
    // (Crucial for sites like Claude that aggressively capture keyboard input)
    const stopPropagationFn = (e) => e.stopPropagation();
    searchInputElement.addEventListener('keydown', (e) => {
        e.stopPropagation(); // Stop all keydowns from reaching the host page
        if (e.key === 'Escape') {
            if (searchInputElement.value.length > 0) {
                searchInputElement.value = '';
                searchClearBtnElement.style.display = 'none';
                _filterTOCItems('');
            }
        }
    });
    searchInputElement.addEventListener('keyup', stopPropagationFn);
    searchInputElement.addEventListener('keypress', stopPropagationFn);

    searchContainerElement.appendChild(searchIcon);
    searchContainerElement.appendChild(searchInputElement);
    searchContainerElement.appendChild(searchClearBtnElement);
}

/**
 * Filters TOC items based on a search query.
 * Hides items whose label text doesn't match the query.
 * @param {string} query — The search string.
 */
function _filterTOCItems(query) {
    if (!tocListElement) return;

    const normalizedQuery = query.trim().toLowerCase();
    const items = tocListElement.querySelectorAll('.toc-item');
    let visibleCount = 0;

    items.forEach(item => {
        const label = item.querySelector('.toc-item-label');
        if (!label) return;

        const text = label.textContent.toLowerCase();
        if (normalizedQuery === '' || text.includes(normalizedQuery)) {
            item.style.display = '';
            visibleCount++;
        } else {
            item.style.display = 'none';
        }
    });

    // Show/hide no-results message
    if (searchNoResultsElement) {
        if (normalizedQuery !== '' && visibleCount === 0) {
            searchNoResultsElement.style.display = 'block';
        } else {
            searchNoResultsElement.style.display = 'none';
        }
    }
}

/**
 * Clears the search field and resets filter state.
 */
function _clearSearch() {
    if (searchInputElement) searchInputElement.value = '';
    if (searchClearBtnElement) searchClearBtnElement.style.display = 'none';
    if (searchNoResultsElement) searchNoResultsElement.style.display = 'none';
}

// ──────────────────────────────────────────────
// Panel Open/Close
// ──────────────────────────────────────────────

function _openPanel() {
    if (panelElement) panelElement.classList.add('open');
    if (toggleBtnElement) toggleBtnElement.classList.add('hidden');

    // Force active highlight update and scroll to view when opened
    setTimeout(() => {
        if (typeof _updateActiveHighlight === 'function') {
            _updateActiveHighlight();
        }
    }, 350); // wait for CSS transition to complete
}

function _closePanel() {
    if (panelElement) panelElement.classList.remove('open');
    if (toggleBtnElement) toggleBtnElement.classList.remove('hidden');
}

function _togglePanel() {
    if (panelElement && panelElement.classList.contains('open')) {
        _closePanel();
    } else {
        _openPanel();
    }
}

/**
 * Handles global keyboard shortcuts.
 * Alt + T → toggles the panel.
 * @param {KeyboardEvent} e
 */
function _handleKeyboardShortcut(e) {
    // Only respond to Alt + T (don't interfere with inputs/textareas if we can help it,
    // although Alt+T is relatively safe, we want to be clean).
    if (e.altKey && e.code === 'KeyT') {
        // Prevent default browser behavior for Alt+T (often opens a new tab or menu in some contexts)
        e.preventDefault();
        _togglePanel();
    }
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

    // Reset search filter
    _clearSearch();

    // Reset scroll observer
    if (scrollObserver) {
        scrollObserver.disconnect();
    }
    messageToTOCItemMap.clear();
    currentlyIntersecting.clear();

    if (items.length === 0) {
        if (progressIndicatorElement) progressIndicatorElement.textContent = '';
        _showEmptyState();
        return;
    }

    _hideEmptyState();

    // Setup scroll observer
    scrollObserver = new IntersectionObserver(_handleScrollIntersection, {
        root: null,
        rootMargin: '10% 0px 10% 0px',
        threshold: 0
    });

    items.forEach((item, index) => {
        const li = _createTOCItem(item, index + 1);
        tocListElement.appendChild(li);

        if (item.element) {
            scrollObserver.observe(item.element);
            const btn = li.querySelector('.toc-item-btn');
            if (btn) messageToTOCItemMap.set(item.element, btn);
        }
    });

    // Auto-detect language direction after full render (if setting enabled)
    if (getSetting('autoDetectDirection')) {
        _autoDetectDirection();
    }
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

    if (item.element) {
        if (!scrollObserver) {
            scrollObserver = new IntersectionObserver(_handleScrollIntersection, {
                root: null,
                rootMargin: '10% 0px 10% 0px',
                threshold: 0
            });
        }
        scrollObserver.observe(item.element);
        const btn = li.querySelector('.toc-item-btn');
        if (btn) messageToTOCItemMap.set(item.element, btn);
    }
}

/**
 * Clears all TOC items and shows the empty state.
 */
function clearTOC() {
    if (tocListElement) {
        tocListElement.innerHTML = '';
    }

    if (scrollObserver) {
        scrollObserver.disconnect();
    }
    messageToTOCItemMap.clear();
    currentlyIntersecting.clear();

    if (progressIndicatorElement) progressIndicatorElement.textContent = '';
    _clearSearch();
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

/**
 * IntersectionObserver callback for scrolling active TOC highlighting.
 * @param {IntersectionObserverEntry[]} entries
 */
function _handleScrollIntersection(entries) {
    let changed = false;
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            currentlyIntersecting.add(entry.target);
            changed = true;
        } else {
            currentlyIntersecting.delete(entry.target);
            changed = true;
        }
    });

    if (changed) {
        _updateActiveHighlight();
    }
}

/**
 * Evaluates currently visible messages and highlights the topmost active item.
 */
function _updateActiveHighlight() {
    let bestTarget = null;

    if (currentlyIntersecting.size === 0) {
        const allTargets = Array.from(messageToTOCItemMap.keys());
        if (allTargets.length === 0) {
            if (progressIndicatorElement) progressIndicatorElement.textContent = '';
            return;
        }

        // We are likely scrolling between prompts (e.g. reading a long response).
        // Find the last prompt that is ABOVE the current viewport, since that's the response we're in.
        const HEADER_OFFSET = 60; // Estimated ChatGPT sticky header height
        let foundTarget = null;
        for (let i = allTargets.length - 1; i >= 0; i--) {
            const rect = allTargets[i].getBoundingClientRect();
            if (rect.top <= HEADER_OFFSET + 100) {
                foundTarget = allTargets[i];
                break;
            }
        }

        // If we scrolled all the way up past the very first prompt, default to the first prompt
        bestTarget = foundTarget || allTargets[0];
    } else {
        // Evaluate the most relevant visible element
        let sortedTargets = Array.from(currentlyIntersecting).sort((a, b) => {
            return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
        });

        bestTarget = sortedTargets[0];
        const HEADER_OFFSET = 60; // Estimated ChatGPT sticky header height

        for (let i = 0; i < sortedTargets.length; i++) {
            const target = sortedTargets[i];
            const rect = target.getBoundingClientRect();

            const visibleTop = Math.max(rect.top, HEADER_OFFSET);
            const visibleHeight = rect.bottom - visibleTop;

            // If the element's top is visible, OR it has at least 30px visible below header
            if (rect.top >= HEADER_OFFSET - 5 || visibleHeight > 30 || i === sortedTargets.length - 1) {
                bestTarget = target;
                break;
            }
        }
    }

    if (bestTarget) {
        const activeBtn = messageToTOCItemMap.get(bestTarget);
        if (activeBtn) {
            // Remove active class from all
            messageToTOCItemMap.forEach(btn => btn.classList.remove('active'));

            // Add active class to current
            activeBtn.classList.add('active');

            // Update progress indicator
            const total = messageToTOCItemMap.size;
            const activeIndex = Array.from(tocListElement.children).indexOf(activeBtn.parentElement) + 1;
            if (progressIndicatorElement) {
                progressIndicatorElement.textContent = `${activeIndex} / ${total} prompts`;
            }

            // Keep the active item in view within the TOC list container
            if (listContainerElement) {
                const containerRect = listContainerElement.getBoundingClientRect();
                const btnRect = activeBtn.getBoundingClientRect();

                if (btnRect.top < containerRect.top || btnRect.bottom > containerRect.bottom) {
                    activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
        }
    }
}

// ──────────────────────────────────────────────
// Scroll + Highlight
// ──────────────────────────────────────────────

/**
 * Smoothly scrolls to a message element and temporarily highlights it.
 *
 * @param {HTMLElement} messageElement — The message container to scroll to.
 */
function _scrollToMessage(messageElement) {
    if (!messageElement || !document.contains(messageElement)) {
        console.warn("ThreadMap: message structure changed");
        return;
    }

    // Remove any active highlight first
    if (currentHighlight) {
        _removeHighlight(currentHighlight);
    }

    // Smooth scroll into the center of the viewport
    messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Skip highlight animation if setting is off
    if (!getSetting('highlightOnScroll')) return;

    // Apply highlight animation
    messageElement.style.animation = `toc-highlight-fade ${HIGHLIGHT_DURATION_MS}ms ease-out`;
    messageElement.style.borderRadius = '8px';
    currentHighlight = messageElement;

    // Inject the keyframe animation into the host page if not already done
    _ensureHighlightStyles();

    // Remove highlight after animation completes
    if (highlightTimer) clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => {
        _removeHighlight(messageElement);
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
    style.setAttribute('data-threadmap-toc', 'highlight');
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
 * Detects whether the page is in dark mode and updates the host class.
 *
 * Strategy:
 *   1. Check for `dark` class on <html> element (common convention).
 *   2. Check for `data-theme="dark"` attribute.
 *   3. Fallback to `prefers-color-scheme` media query.
 */
function _detectTheme() {
    if (!hostElement) return;

    const mode = getSetting('themeMode');

    // If user forced a specific theme, apply it directly
    if (mode === 'dark') {
        hostElement.classList.add(DARK_THEME_CLASS);
        return;
    }
    if (mode === 'light') {
        hostElement.classList.remove(DARK_THEME_CLASS);
        return;
    }

    // Auto-detect from page theme
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

// ──────────────────────────────────────────────
// Panel Position
// ──────────────────────────────────────────────

/**
 * Applies the panel position (left or right) by toggling CSS classes.
 * @param {'left'|'right'} position
 */
function _applyPanelPosition(position) {
    if (!hostElement) return;

    if (position === 'left') {
        hostElement.classList.add('panel-left');
    } else {
        hostElement.classList.remove('panel-left');
    }
}

/**
 * Applies the panel width by setting a CSS custom property.
 * @param {number} width — Width in pixels (240, 280, 320, 360).
 */
function _applyPanelWidth(width) {
    if (!hostElement) return;
    hostElement.style.setProperty('--toc-panel-width', width + 'px');
}

// ──────────────────────────────────────────────
// Settings Overlay
// ──────────────────────────────────────────────

/**
 * Builds the settings overlay panel (hidden by default).
 * Contains all 7 settings with appropriate controls.
 */
function _buildSettingsOverlay() {
    settingsOverlayElement = document.createElement('div');
    settingsOverlayElement.className = 'toc-page';
    settingsOverlayElement.id = 'toc-page-settings';

    // Settings header with back button
    const header = document.createElement('div');
    header.className = 'toc-settings-header';

    const backBtn = document.createElement('button');
    backBtn.className = 'toc-settings-back-btn';
    backBtn.innerHTML = '&#x2190;';
    backBtn.setAttribute('aria-label', 'Back to contents');
    backBtn.setAttribute('title', 'Back');
    backBtn.addEventListener('click', () => {
        _closeSettingsOverlay();
    });

    const settingsTitle = document.createElement('span');
    settingsTitle.className = 'toc-settings-title';
    settingsTitle.textContent = 'Settings';

    header.appendChild(backBtn);
    header.appendChild(settingsTitle);
    settingsOverlayElement.appendChild(header);

    // Settings body (scrollable)
    const body = document.createElement('div');
    body.className = 'toc-settings-body';

    // 1. Enable Thread Map
    body.appendChild(_createToggleSetting(
        'Enable Thread Map',
        'Master on/off switch',
        'enabled',
        getSetting('enabled')
    ));

    // 2. Scroll Highlight
    body.appendChild(_createToggleSetting(
        'Scroll highlight',
        'Highlight animation when navigating',
        'highlightOnScroll',
        getSetting('highlightOnScroll')
    ));

    // 3. Theme Mode
    body.appendChild(_createSelectSetting(
        'Theme mode',
        'themeMode',
        getSetting('themeMode'),
        [
            { value: 'auto', label: 'Auto' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
        ]
    ));

    // 4. Auto-detect Direction
    body.appendChild(_createToggleSetting(
        'Auto-detect direction',
        'Detect RTL/LTR from messages',
        'autoDetectDirection',
        getSetting('autoDetectDirection')
    ));

    // 5. Label Max Length
    body.appendChild(_createSelectSetting(
        'Label max length',
        'labelMaxLength',
        getSetting('labelMaxLength'),
        [
            { value: 30, label: '30 chars' },
            { value: 60, label: '60 chars' },
            { value: 90, label: '90 chars' },
            { value: 120, label: '120 chars' },
        ]
    ));

    // 6. Auto-open Panel
    body.appendChild(_createToggleSetting(
        'Auto-open panel',
        'Open panel on page load',
        'autoOpenPanel',
        getSetting('autoOpenPanel')
    ));

    // 7. Panel Position
    body.appendChild(_createSelectSetting(
        'Panel position',
        'panelPosition',
        getSetting('panelPosition'),
        [
            { value: 'right', label: 'Right' },
            { value: 'left', label: 'Left' },
        ]
    ));

    // 8. Panel Width
    body.appendChild(_createSelectSetting(
        'Panel width',
        'panelWidth',
        getSetting('panelWidth'),
        [
            { value: 240, label: '240px' },
            { value: 280, label: '280px' },
            { value: 320, label: '320px' },
            { value: 360, label: '360px' },
        ]
    ));

    settingsOverlayElement.appendChild(body);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'toc-settings-footer';

    let versionStr = 'v1.0.0';
    try {
        const manifest = chrome.runtime.getManifest();
        versionStr = 'v' + manifest.version;
    } catch (e) { }

    footer.innerHTML = `
        <strong>Pro Tip:</strong> Press <code>Alt + T</code> to toggle the Thread Map panel at any time.<br><br>
        Changes save automatically<br><br>
        <span style="opacity: 0.7; font-size: 10px;">Thread Map ${versionStr}</span>
    `;
    settingsOverlayElement.appendChild(footer);
}

/**
 * Creates a toggle-style setting row.
 *
 * @param {string} label — Display name
 * @param {string} description — Short description
 * @param {string} key — Settings key
 * @param {boolean} currentValue
 * @returns {HTMLElement}
 */
function _createToggleSetting(label, description, key, currentValue) {
    const row = document.createElement('div');
    row.className = 'toc-setting-row';

    const info = document.createElement('div');
    info.className = 'toc-setting-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'toc-setting-name';
    nameEl.textContent = label;

    const descEl = document.createElement('div');
    descEl.className = 'toc-setting-desc';
    descEl.textContent = description;

    info.appendChild(nameEl);
    info.appendChild(descEl);

    // Toggle switch
    const toggle = document.createElement('label');
    toggle.className = 'toc-toggle-switch';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = currentValue;
    input.addEventListener('change', () => {
        saveSettings({ [key]: input.checked });
        _handleSettingChange(key, input.checked);
    });

    const slider = document.createElement('span');
    slider.className = 'toc-toggle-slider';

    toggle.appendChild(input);
    toggle.appendChild(slider);

    row.appendChild(info);
    row.appendChild(toggle);
    return row;
}

/**
 * Creates a select/dropdown-style setting row.
 *
 * @param {string} label — Display name
 * @param {string} key — Settings key
 * @param {*} currentValue
 * @param {Array<{value: *, label: string}>} options
 * @returns {HTMLElement}
 */
function _createSelectSetting(label, key, currentValue, options) {
    const row = document.createElement('div');
    row.className = 'toc-setting-row';

    const info = document.createElement('div');
    info.className = 'toc-setting-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'toc-setting-name';
    nameEl.textContent = label;

    info.appendChild(nameEl);

    const select = document.createElement('select');
    select.className = 'toc-select';

    for (const opt of options) {
        const optEl = document.createElement('option');
        optEl.value = opt.value;
        optEl.textContent = opt.label;
        if (String(opt.value) === String(currentValue)) {
            optEl.selected = true;
        }
        select.appendChild(optEl);
    }

    select.addEventListener('change', () => {
        // Parse numeric values if appropriate
        let val = select.value;
        if (key === 'labelMaxLength' || key === 'panelWidth') val = parseInt(val, 10);
        saveSettings({ [key]: val });
        _handleSettingChange(key, val);
    });

    row.appendChild(info);
    row.appendChild(select);
    return row;
}

/**
 * Handles immediate visual effects from a setting change.
 * @param {string} key
 * @param {*} value
 */
function _handleSettingChange(key, value) {
    switch (key) {
        case 'enabled':
            if (!value) {
                // Teardown from content.js will handle this via onSettingsChanged
            }
            break;
        case 'themeMode':
            _detectTheme();
            break;
        case 'panelPosition':
            _applyPanelPosition(value);
            break;
        case 'autoDetectDirection':
            if (value) _autoDetectDirection();
            break;
        case 'labelMaxLength':
            // Will apply on next refresh
            break;
        case 'panelWidth':
            _applyPanelWidth(value);
            break;
    }
}

/**
 * Utility function to handle page navigation transitions.
 * Supports sliding left/right logic generic for pages.
 * @param {HTMLElement} fromPage The page we are leaving
 * @param {HTMLElement} toPage The page we are entering
 */
function _navigateToPage(fromPage, toPage) {
    if (!fromPage || !toPage) return;

    // Set class to cause the 'from' page to slide left and fade
    fromPage.classList.remove('active');
    fromPage.classList.add('previous');

    // Set class to cause the 'to' page to center
    toPage.classList.remove('previous');
    toPage.classList.add('active');
}

/**
 * Utility to go backward in page navigation (slides right).
 * @param {HTMLElement} fromPage The current deeper page
 * @param {HTMLElement} toPage The parent page sliding back into view
 */
function _navigateBackToPage(fromPage, toPage) {
    if (!fromPage || !toPage) return;

    // Reset the deeper page back to its right-side initial state
    fromPage.classList.remove('active');
    fromPage.classList.remove('previous');

    // Bring the parent page from 'previous' state back to center 'active'
    toPage.classList.remove('previous');
    toPage.classList.add('active');
}

/**
 * Opens the settings overlay, smoothly transitioning away from TOC list.
 */
function _openSettingsOverlay() {
    _navigateToPage(mainPageElement, settingsOverlayElement);
}

/**
 * Closes the settings overlay, transitioning back to the TOC list.
 */
function _closeSettingsOverlay() {
    _navigateBackToPage(settingsOverlayElement, mainPageElement);
}
