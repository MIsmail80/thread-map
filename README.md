# Thread Map

<div align="center">
  <img src="icons/icon-128.png" alt="Thread Map Logo" width="128" height="128" />
</div>

<h3 align="center">Navigate Long AI Conversations with Ease</h3>

<div align="center">
  Organizes long AI conversations into structured, navigable knowledge by automatically generating a floating, interactive Table of Contents based on your prompts.
</div>

<br />

**Supported Platforms:** ChatGPT (`chatgpt.com`), Claude (`claude.ai`), and Gemini (`gemini.google.com`).

---

## ✨ Key Features

- **Automatic TOC Generation:** Scans all user-sent messages and builds a numbered Table of Contents from the first line of each message.
- **Multi-Platform Support:** Works seamlessly across ChatGPT, Claude, and Gemini with an advanced adapter architecture.
- **Search & Filter:** Quickly find specific prompts in long threads with the built-in search bar.
- **Active Item Highlight & Scroll Indicator:** Visually tracks your reading progress (e.g., "12 / 37 prompts") and highlights the current prompt in the TOC.
- **Real-Time Updates:** Updates live as you converse without needing manual refreshes.
- **Click-to-Scroll Navigation:** Click any TOC item to smoothly scroll the conversation to perfectly center that specific message.
- **Floating Glassmorphism UI:** A beautiful, draggable side panel that perfectly respects the host site's Dark/Light mode themes.
- **100% Private & Local:** All processing happens locally in your browser. No data is sent to external servers. Zero telemetry.
- **Keyboard Shortcut:** Quickly toggle the panel with `Alt + T` from anywhere on the page.

[➡️ Read the full, detailed features list](artfacts/FEATURES.md)

---

## 🚀 Installation

### Option 1: Chrome Web Store
*(Coming Soon)*

### Option 2: Manual Installation (Developer Mode)
1. Download or clone this repository:
   ```bash
   git clone https://github.com/MIsmail80/thread-map.git
   ```
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle in the top right corner.
4. Click the **Load unpacked** button and select the cloned `ThreadMap` directory (the folder containing `manifest.json`).
5. Open ChatGPT, Claude, or Gemini to see Thread Map in action!

---

## ⚙️ How It Works

Thread Map inspects the host page using a lightweight content script. It leverages an optimized `MutationObserver` to watch the DOM for user messages. Messages are deduplicated, normalized across different AI platforms, and rendered into an interactive UI.

The UI is completely isolated within a **Shadow DOM**, ensuring the extension's styles do not interfere with the host website, and vice-versa. 

### Architecture Highlights
- **Decoupled Modular Design:** Code is cleanly separated across logical boundaries (`/core`, `/models`, `/observer`, `/platforms`).
- **Event-Driven:** Utilizes a custom `EventBus` to synchronize the UI dynamically without tightly coupled components.
- **Optimized Performance:** Uses debounced observers, idempotent panel creation, and intelligent SPA (Single Page Application) navigation detection to ensure zero impact on page performance, even in extremely long chats.
- **Tested Core:** A robust unit testing suite ensures core logic stays reliable.

---

## 🌍 i18n & RTL Support

Thread Map provides best-in-class internationalization. It intelligently detects right-to-left (RTL) languages based on character counts and heuristics. When triggered, it automatically adjust the layout, text direction, and alignments to provide a native reading experience. You can also manually toggle the reading direction via the panel toolbar.

---

## 🛠️ Development

### Prerequisites
- Node.js (for running tests)

### Running Tests
The project uses `Vitest` for testing its core utilities, normalizers, and strategies.
```bash
npm install
npm run test
```

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <i>Thread Map is an open-source tool and is not affiliated with, endorsed by, or sponsored by OpenAI, Google, or Anthropic.</i>
</p>
