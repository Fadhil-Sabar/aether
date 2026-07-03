(function (window) {
  const app = (window.AetherApp = window.AetherApp || {});

  const STORAGE_KEYS = {
    chats: "aether_chats",
    currentChatId: "aether_current_chat_id",
    showMetrics: "aether_show_metrics",
    toolsEnabled: "aether_tools_enabled",
    webSearchEnabled: "aether_web_search",
    jinaApiKey: "aether_jina_key",
    searchProvider: "aether_search_provider",
    searxngUrl: "aether_searxng_url",
    systemPrompt: "aether_system_prompt",
    configParams: "aether_config_params",
    theme: "theme",
  };
  const DEFAULT_SYSTEM_PROMPT =
    "You are a professional AI assistant. Don't use emoji. Aim for clarity and depth. If a document is provided, use it as your primary source.";

  const DEFAULT_SEARXNG_URL = "http://172.17.0.1:8080";
  const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;
  const MAX_CHAT_COUNT = 100;
  const MAX_MESSAGE_COUNT = 500;
  const MAX_MESSAGE_TEXT_LENGTH = 40000;
  const MAX_CHAT_TITLE_LENGTH = 200;
  const MAX_CONTEXT_ITEMS = 20;
  const MAX_WEB_REFERENCES = 20;
  const MAX_REFERENCE_RESULTS = 20;
  const MAX_STORED_STRING_LENGTH = 16000;

  function uid(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  function clampNumber(value, options) {
    const parsed = options.integer
      ? Number.parseInt(value, 10)
      : Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return options.fallback;
    const clamped = Math.min(options.max, Math.max(options.min, parsed));
    return options.integer ? Math.round(clamped) : clamped;
  }

  function limitString(value, maxLength, fallback) {
    if (typeof value !== "string") return fallback || "";
    return value.slice(0, maxLength);
  }

  function normalizeStoredString(value, fallback, maxLength) {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, maxLength) : fallback;
  }

  function parseJsonText(rawValue, fallback, label) {
    if (typeof rawValue !== "string" || rawValue.trim() === "") return fallback;
    try {
      return JSON.parse(rawValue);
    } catch (error) {
      console.warn(`Failed to parse ${label}; using fallback.`, error);
      return fallback;
    }
  }

  function readJson(key, fallback) {
    const rawValue = localStorage.getItem(key);
    const parsedValue = parseJsonText(rawValue, fallback, `localStorage key ${key}`);
    if (
      parsedValue === fallback &&
      typeof rawValue === "string" &&
      rawValue.trim() !== ""
    ) {
      localStorage.removeItem(key);
    }
    return parsedValue;
  }

  function normalizeReferenceResult(result) {
    if (!result || typeof result !== "object") return null;
    return {
      title: limitString(result.title, MAX_CHAT_TITLE_LENGTH, ""),
      url: limitString(result.url, MAX_STORED_STRING_LENGTH, ""),
      description: limitString(result.description, MAX_MESSAGE_TEXT_LENGTH, ""),
    };
  }

  function cloneWebReferences(webReferences) {
    if (!Array.isArray(webReferences)) return [];
    return webReferences
      .map(function (ref) {
        if (!ref || typeof ref !== "object") return null;
        return {
          query: limitString(ref.query, MAX_STORED_STRING_LENGTH, ""),
          results: Array.isArray(ref.results)
            ? ref.results
                .slice(0, MAX_REFERENCE_RESULTS)
                .map(normalizeReferenceResult)
                .filter(Boolean)
            : [],
        };
      })
      .filter(Boolean)
      .slice(0, MAX_WEB_REFERENCES);
  }

  function ensureMessageShape(message) {
    const base = message && typeof message === "object" ? message : {};
    return {
      id:
        typeof base.id === "string" && base.id.trim()
          ? base.id.trim().slice(0, 120)
          : uid("msg"),
      text: limitString(base.text, MAX_MESSAGE_TEXT_LENGTH, ""),
      isUser: Boolean(base.isUser),
      metrics:
        base.metrics && typeof base.metrics === "object" ? base.metrics : null,
      webReferences: cloneWebReferences(base.webReferences),
    };
  }

  function ensureChatShape(chat, fallbackPrefix, index) {
    const base = chat && typeof chat === "object" ? chat : {};
    const messages = Array.isArray(base.messages)
      ? base.messages.slice(0, MAX_MESSAGE_COUNT).map(ensureMessageShape)
      : [];

    const fallbackId = `${fallbackPrefix || "chat"}-${Date.now()}-${index || 0}`;

    return {
      id:
        typeof base.id === "string" && base.id.trim()
          ? base.id.trim().slice(0, 120)
          : fallbackId,
      title:
        typeof base.title === "string" && base.title.trim()
          ? base.title.trim().slice(0, MAX_CHAT_TITLE_LENGTH)
          : limitString(messages[0] ? messages[0].text : "Untitled", MAX_CHAT_TITLE_LENGTH, "Untitled"),
      messages: messages,
      timestamp: Number.isFinite(Number(base.timestamp))
        ? Number(base.timestamp)
        : Date.now(),
      context: Array.isArray(base.context)
        ? base.context.slice(0, MAX_CONTEXT_ITEMS)
        : [],
    };
  }

  function normalizeChatCollection(rawChats, fallbackPrefix) {
    if (!Array.isArray(rawChats)) return [];
    return rawChats
      .slice(0, MAX_CHAT_COUNT)
      .map(function (chat, index) {
        return ensureChatShape(chat, fallbackPrefix, index);
      });
  }

  function dedupeChatsById(chats) {
    const seen = new Set();
    return chats.filter(function (chat) {
      if (!chat || seen.has(chat.id)) return false;
      seen.add(chat.id);
      return true;
    });
  }

  function normalizeImportedPayload(payload) {
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.chats)) {
      throw new Error("Invalid import format");
    }

    const chats = dedupeChatsById(
      normalizeChatCollection(payload.chats, "imported-chat"),
    );

    if (chats.length === 0) {
      throw new Error("Import does not contain any valid chats");
    }

    return chats;
  }

  function parseNdjsonObjects(buffer, flush) {
    const lines = String(buffer || "").split("\n");
    const remainder = flush ? "" : lines.pop() || "";
    const objects = [];

    lines.forEach(function (rawLine) {
      const line = rawLine.trim();
      if (!line) return;
      try {
        objects.push(JSON.parse(line));
      } catch (error) {
        console.warn("Skipping malformed NDJSON line", line.slice(0, 200), error);
      }
    });

    return { objects: objects, remainder: remainder };
  }

  function loadChats() {
    const stored = readJson(STORAGE_KEYS.chats, []);
    return dedupeChatsById(normalizeChatCollection(stored, "stored-chat"));
  }

  function loadConfig() {
    return {
      showMetrics: localStorage.getItem(STORAGE_KEYS.showMetrics) === "true",
      toolsEnabled: localStorage.getItem(STORAGE_KEYS.toolsEnabled) !== "false",
      webSearchEnabled:
        localStorage.getItem(STORAGE_KEYS.webSearchEnabled) === "true",
      jinaApiKey: normalizeStoredString(
        localStorage.getItem(STORAGE_KEYS.jinaApiKey),
        "",
        500,
      ),
      searchProvider:
        localStorage.getItem(STORAGE_KEYS.searchProvider) === "searxng"
          ? "searxng"
          : "jina",
      searxngUrl: normalizeStoredString(
        localStorage.getItem(STORAGE_KEYS.searxngUrl),
        DEFAULT_SEARXNG_URL,
        1000,
      ),
      customSystemPrompt: normalizeStoredString(
        localStorage.getItem(STORAGE_KEYS.systemPrompt),
        DEFAULT_SYSTEM_PROMPT,
        MAX_STORED_STRING_LENGTH,
      ),
    };
  }

  function loadAppState() {
    const chats = loadChats();
    const currentChatId = normalizeStoredString(
      localStorage.getItem(STORAGE_KEYS.currentChatId),
      null,
      120,
    );

    return {
      chats: chats,
      currentChatId: chats.some(function (chat) {
        return chat.id === currentChatId;
      })
        ? currentChatId
        : null,
      activeContext: [],
      currentAbortController: null,
      thinkModels: [
        "qwen3",
        "qwen3.5",
        "deepseek-r1",
        "deepseek-v3.1",
        "gpt-oss",
      ],
      ...loadConfig(),
    };
  }

  function saveChats(chats) {
    localStorage.setItem(
      STORAGE_KEYS.chats,
      JSON.stringify(dedupeChatsById(normalizeChatCollection(chats, "chat"))),
    );
  }

  function saveCurrentChatId(chatId) {
    if (chatId) {
      localStorage.setItem(STORAGE_KEYS.currentChatId, String(chatId).slice(0, 120));
    } else {
      localStorage.removeItem(STORAGE_KEYS.currentChatId);
    }
  }

  function saveConfig(state) {
    localStorage.setItem(STORAGE_KEYS.showMetrics, String(state.showMetrics));
    localStorage.setItem(STORAGE_KEYS.toolsEnabled, String(state.toolsEnabled));
    localStorage.setItem(
      STORAGE_KEYS.webSearchEnabled,
      String(state.webSearchEnabled),
    );
    localStorage.setItem(
      STORAGE_KEYS.jinaApiKey,
      normalizeStoredString(state.jinaApiKey, "", 500),
    );
    localStorage.setItem(
      STORAGE_KEYS.searchProvider,
      state.searchProvider === "searxng" ? "searxng" : "jina",
    );
    localStorage.setItem(
      STORAGE_KEYS.searxngUrl,
      normalizeStoredString(state.searxngUrl, DEFAULT_SEARXNG_URL, 1000),
    );
    localStorage.setItem(
      STORAGE_KEYS.systemPrompt,
      normalizeStoredString(
        state.customSystemPrompt,
        DEFAULT_SYSTEM_PROMPT,
        MAX_STORED_STRING_LENGTH,
      ),
    );
  }

  function createChat(overrides) {
    return ensureChatShape(
      Object.assign(
        {
          id: uid("chat"),
          title: "Untitled",
          messages: [],
          timestamp: Date.now(),
          context: [],
        },
        overrides || {},
      ),
      "chat",
      0,
    );
  }

  function createMessage(overrides) {
    return ensureMessageShape(
      Object.assign(
        {
          id: uid("msg"),
          text: "",
          isUser: false,
          metrics: null,
          webReferences: [],
        },
        overrides || {},
      ),
    );
  }

  function findChatById(chats, chatId) {
    return chats.find(function (chat) {
      return chat.id === chatId;
    });
  }

  app.stateStorage = {
    STORAGE_KEYS: STORAGE_KEYS,
    DEFAULT_SYSTEM_PROMPT: DEFAULT_SYSTEM_PROMPT,
    DEFAULT_SEARXNG_URL: DEFAULT_SEARXNG_URL,
    MAX_IMPORT_FILE_BYTES: MAX_IMPORT_FILE_BYTES,
    clampNumber: clampNumber,
    createChat: createChat,
    createMessage: createMessage,
    dedupeChatsById: dedupeChatsById,
    ensureChatShape: ensureChatShape,
    ensureMessageShape: ensureMessageShape,
    findChatById: findChatById,
    loadAppState: loadAppState,
    loadChats: loadChats,
    loadConfig: loadConfig,
    normalizeImportedPayload: normalizeImportedPayload,
    parseJsonText: parseJsonText,
    parseNdjsonObjects: parseNdjsonObjects,
    saveChats: saveChats,
    saveConfig: saveConfig,
    saveCurrentChatId: saveCurrentChatId,
    uid: uid,
  };
})(window);
