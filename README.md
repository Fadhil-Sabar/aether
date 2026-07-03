# ⚡ Aether: Multi-Provider LLM Chat Interface

A minimalist browser UI for interacting with multiple LLM providers (Ollama, OpenAI-compatible, Anthropic, and more). Forked from [ollama-interaction](https://github.com/Fadhil-Sabar/ollama-interaction) as a full rebrand toward provider-agnostic design. Chat history stays in your browser, but the app is not fully local by default: it loads several frontend assets from public CDNs and can send URLs or search queries to external services when you explicitly approve those requests.

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Storage](https://img.shields.io/badge/chat%20storage-browser%20localStorage-orange)

## ✨ Features

- 🌑 **Zinc Minimalist Design**: Clean monochrome UI with smooth transitions and dark/light mode support.
- 🔄 **Multi-Provider**: Switch between Ollama, OpenAI-compatible, and Anthropic Claude providers.
- 🛡️ **SSRF Protection**: URL validation blocks localhost and private-network targets before external requests.
- ✅ **Confirmation Prompts**: All external link analysis and web search requests require user confirmation.
- 📂 **Local RAG**: Attach `.txt`, `.md`, and similar files to provide direct context to the model.
- 🔗 **Web Link Analysis**: Paste a URL to fetch and summarize content via Jina Reader.
- 🌐 **Web Search Tools**: Search the web with Jina Search or a self-hosted SearXNG instance.
- 💾 **Browser Persistence**: Chat history and settings are stored in `localStorage` under the `aether_` key prefix.
- ⚡ **Zero Backend**: The app is a static frontend; no Node.js or Python server is required.

## 🧩 Runtime Dependencies

This repository is a static web app, but the default build/runtime path depends on external services:

- UI libraries are loaded from public CDNs in `index.html`:
  - Google Fonts
  - Tailwind CSS CDN
  - jQuery
  - Marked
  - DOMPurify
  - Highlight.js
- Link analysis and the default web-search flow use Jina endpoints:
  - `https://r.jina.ai/…` for link extraction
  - `https://s.jina.ai/…` for web search
- Optional alternative: self-hosted SearXNG via the settings panel

If you want a more offline-friendly setup, you will need to vendor or self-host the frontend assets and choose only services you control.

## 🏗 Architecture Note

The runtime currently uses **`script.js`** as the monolithic application controller (state management, API calls, rendering, RAG, search). The `js/` directory contains modular components (`provider-manager.js`, `stream-parser.js`, provider adapters) that are loaded alongside `script.js` to provide provider abstraction and streaming support. Additional modular files (`chat-controller.js`, `rendering.js`, `state-storage.js`, `search-providers.js`) exist as a planned migration target but are **not yet wired** into `index.html`. The medium-term goal is a full cutover from `script.js` to the modular architecture, but for now the monolithic runtime is the source of truth.

## 🛠 Prerequisites

### For Ollama provider:

1. **Install Ollama**: Download and install from [ollama.com](https://ollama.com).
2. **Allow browser access**: Since the UI runs in the browser, you must allow Ollama to accept requests from your local origin.

   ```bash
   # For Linux/macOS
   export OLLAMA_ORIGINS="*"
   ollama serve
   ```

3. **Pull a model**:
   ```bash
   ollama pull llama3
   ```

### For OpenAI-compatible providers:

1. Obtain an API key from your provider (OpenAI, Groq, Together, etc.).
2. In Aether's Settings panel, add a new provider with your base URL and API key.

### For Anthropic Claude:

1. Obtain an API key from [console.anthropic.com](https://console.anthropic.com).
2. In Aether's Settings panel, add an Anthropic Claude provider.

## 🚀 Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/Fadhil-Sabar/aether.git
   ```
2. Open `index.html` in a modern web browser.
3. Select your provider and model from the settings panel.
4. Start chatting!

## 📄 How to use RAG

- **Attach Files**: Click the 📎 icon to upload a text or code file. The AI will use it as a primary knowledge source.
- **Analyze Links**: Paste a full URL (starting with `http://` or `https://`) into the chat. The system will read the link and summarize or answer based on it.
- **Web Search**: Enable web search in Settings, then choose Jina or SearXNG.
- **Thread Management**: Use the sidebar to create new threads, rename them, or delete past conversations.

## 🖼 Screenshots

![alt text](image.png)
![alt text](image-1.png)
![alt text](image-2.png)

- **Chat Interface**: Clean threaded view with role-based alignment.
- **Context Chips**: Interactive chips for attached documents.

## 🔧 Configuration

All settings are persisted in browser `localStorage` under keys prefixed with `aether_`:

| Key | Description |
|---|---|
| `aether_chats` | Serialized chat history |
| `aether_current_chat_id` | Active chat identifier |
| `aether_providers` | Provider configurations |
| `aether_active_provider_id` | Currently selected provider |
| `aether_show_metrics` | Toggle performance metrics |
| `aether_tools_enabled` | Toggle tool-calling support |
| `aether_web_search` | Toggle web search capability |
| `aether_system_prompt` | Custom system prompt override |

## 🔄 Migration from ollama_* keys

If you used the original **ollama-interaction** app, Aether automatically migrates your existing `ollama_*` localStorage keys to `aether_*` on first load (the old keys are cleaned up). No data loss — your chats and settings carry over seamlessly.

## ⚖️ License

This project is licensed under the MIT License. See the LICENSE file for details.

---

Built for speed, clarity, and aesthetic lovers.
