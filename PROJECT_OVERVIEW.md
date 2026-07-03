# Aether: Multi-Provider AI Interface

A high-performance, private, and minimalist web interface for interacting with multiple LLM providers (Ollama, OpenAI-compatible, Anthropic, and more).

## 🚀 Overview
This project provides a clean, "Zen" style interface for LLMs. It focuses on privacy, speed, and advanced RAG (Retrieval-Augmented Generation) capabilities without requiring a complex backend. Forked from [ollama-interaction](https://github.com/Fadhil-Sabar/ollama-interaction) and rebranded to Aether for provider-agnostic identity.

## 🛠 Tech Stack
- **Frontend**: HTML5, Vanilla CSS, jQuery 3.7.1
- **Styling**: Tailwind CSS (CDN Integration)
- **AI Engine**: Multi-provider support (Ollama, OpenAI-compatible, Anthropic, etc.)
- **Rendering**: Marked.js for Markdown support
- **Web Analysis**: Jina Reader (`r.jina.ai`)

## ✨ Key Features

### 1. Minimalist Zinc Design
- **Aesthetic**: Premium monochromatic palette with Zinc/Slate accents.
- **Responsive**: Sidebar for history, adaptive container for chat.
- **Modes**: Full support for System-aware Light and Dark modes.

### 2. Multi-Provider Architecture
- **Ollama**: Local models via Ollama API (`http://localhost:11434`).
- **OpenAI-Compatible**: Works with OpenAI, Groq, Together, and any OpenAI-compatible API.
- **Anthropic Claude**: Claude models via Anthropic API.
- **Provider Picker**: Add, remove, and switch between providers via the Settings panel.

### 3. Advanced Context Management (RAG) & Tools
- **Local File RAG**: Users can attach `.txt`, `.md`, or code files. Content is read client-side and injected into the prompt.
- **Link Analysis (Tool Calling)**: Integrated with the provider's `tools` API. The model can autonomously decide to call `process_link` via Jina Reader (`r.jina.ai`) to fetch live web content.
- **Autonomous Web Search**: Model can call `web_search` tool using Jina AI Search API (`s.jina.ai`) for real-time information. Supports API Key configuration in settings.
- **Reference Tracking**: Each response displays a list of search queries used as references.
- **Pinned Context**: Attached files/links stay active (pinned) for multiple questions until manually removed.

### 4. Smart Memory & Tool Loop
- **Autonomous Execution**: A specialized "Tool Loop" in the frontend handles multi-turn interactions, allowing the model to request data, receive it, and then formulate a final response.
- **Sliding Window**: The system sends the **last 10 chat bubbles** to the LLM using the chat API. This maintains better conversation context while preventing memory bloat.
- **Smart Auto-Scroll**: Intelligent scroll management that only anchors to the bottom if the user is already there, allowing uninterrupted reading of previous messages during generation.
- **Token Independent**: Memory is managed via text-based history rather than context tokens for precise control.

### 5. Chat Management
- **Persistence**: Full chat history and settings saved in `LocalStorage` under `aether_` prefix.
- **Organization**: Users can create new threads, rename them, and delete old ones.
- **Streaming**: Full support for real-time streaming responses.

## 📂 Project Structure
- `index.html`: Semantic structure and layout.
- `style.css`: Custom design tokens, transitions, and Zinc theme variables.
- `script.js`: State management, provider API integration, and RAG logic.
- `js/`: Modular JavaScript components:
  - `provider-manager.js` — Multi-provider CRUD and storage migration
  - `state-storage.js` — localStorage abstraction layer
  - `chat-controller.js` — Chat lifecycle and API communication
  - `rendering.js` — DOM rendering utilities
  - `search-providers.js` — Web search integration

## 📝 Important Notes for Future Agents
- **Multi-Provider**: The app supports multiple LLM providers via a provider abstraction layer. Provider configs live in `js/provider-manager.js`.
- **Storage Migration**: Old `ollama_*` localStorage keys are automatically migrated to `aether_*` on first load.
- **LocalStorage Keys**: All keys now use the `aether_` prefix (e.g., `aether_chats`, `aether_providers`).
- **Zero Backend**: All logic is client-side. Do not introduce server-side dependencies (Node.js/Python) unless explicitly requested.
- **Prompt Engineering**: The prompt structure is hierarchical: 1. Pinned Knowledge, 2. Last 10 Chats, 3. New Instruction.

---

*Forked from ollama-interaction — July 2026*
