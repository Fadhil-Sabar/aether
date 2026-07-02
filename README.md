# 🧶 Ollama Interaction: Minimalist Zinc

A minimalist browser UI for interacting with Ollama. It is privacy-friendly in the sense that chat history stays in your browser, but it is not fully local by default: the app loads several assets from public CDNs and can use external web-search / link-processing services.

![Version](https://img.shields.io/badge/version-1.2.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Storage](https://img.shields.io/badge/chat%20storage-browser%20localStorage-orange)

## ✨ Features

- 🌑 **Zinc Minimalist Design**: Clean monochrome UI with smooth transitions and dark/light mode support.
- 📂 **Local RAG**: Attach `.txt`, `.md`, and similar files to provide direct context to the model.
- 🔗 **Web Link Analysis**: Paste a URL to fetch and summarize content via Jina Reader.
- 🌐 **Web Search Tools**: Search the web with Jina Search or a self-hosted SearXNG instance.
- 💾 **Browser Persistence**: Chat history and settings are stored in `localStorage`.
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

## 🛠 Prerequisites

1. **Install Ollama**: Download and install from [ollama.com](https://ollama.com).
2. **Allow browser access to Ollama**: Since the UI runs in the browser, you must allow Ollama to accept requests from your local origin.

   ```bash
   # For Linux/macOS
   export OLLAMA_ORIGINS="*"
   ollama serve
   ```

3. **Optional web-search setup**:
   - Use Jina Search as-is, optionally with a Jina API key
   - Or run SearXNG and point the app to your instance in Settings

## 🚀 Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/ollama-interaction.git
   ```
2. Open `index.html` in a modern web browser.
3. Select your model from the dropdown (make sure you have models pulled, e.g. `ollama pull llama3`).
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

## ⚖️ License

This project is licensed under the MIT License. See the LICENSE file for details.

---

Built for speed, clarity, and aesthetic lovers.
