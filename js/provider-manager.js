(function (window) {
  "use strict";

  const app = (window.AetherApp = window.AetherApp || {});

  // ── Storage Keys ──────────────────────────────────────────
  const KEYS = {
    providers: "aether_providers",
    activeProviderId: "aether_active_provider_id",
    rememberApiKeys: "aether_remember_keys",
    sessionApiKeys: "aether_session_api_keys",
  };

  // ── In-memory (session-only) API key storage ──────────────
  let _sessionOnlyKeys = {}; // { [providerId]: apiKey }

  // ── Provider Type Definitions ─────────────────────────────
  const PROVIDER_TYPES = {
    ollama: {
      label: "Ollama",
      defaultBaseUrl: "http://localhost:11434",
      defaultConfig: {
        temperature: 0.7,
        num_ctx: 16384,
        top_p: 0.9,
        top_k: 40,
      },
    },
    openai: {
      label: "OpenAI-Compatible",
      defaultBaseUrl: "https://api.openai.com/v1",
      defaultConfig: {
        temperature: 0.7,
        max_tokens: 4096,
        top_p: 0.9,
      },
    },
    anthropic: {
      label: "Anthropic Claude",
      defaultBaseUrl: "https://api.anthropic.com/v1",
      defaultConfig: {
        temperature: 0.7,
        max_tokens: 4096,
      },
    },
    "opencode-go": {
      label: "OpenCode Go",
      defaultBaseUrl: "https://opencode.ai/zen/go/v1",
      defaultConfig: {
        temperature: 0.7,
        max_tokens: 4096,
        top_p: 0.9,
      },
    },
  };

  // ── Default Providers ─────────────────────────────────────
  function createDefaultProviders() {
    return [
      {
        id: "ollama-local",
        name: "Ollama Local",
        type: "ollama",
        baseUrl: PROVIDER_TYPES.ollama.defaultBaseUrl,
        apiKey: "",
        defaultModel: "",
        isActive: true,
        config: { ...PROVIDER_TYPES.ollama.defaultConfig },
      },
      {
        id: "openai-main",
        name: "OpenAI",
        type: "openai",
        baseUrl: PROVIDER_TYPES.openai.defaultBaseUrl,
        apiKey: "",
        defaultModel: "",
        isActive: false,
        config: { ...PROVIDER_TYPES.openai.defaultConfig },
      },
      {
        id: "anthropic-main",
        name: "Anthropic Claude",
        type: "anthropic",
        baseUrl: PROVIDER_TYPES.anthropic.defaultBaseUrl,
        apiKey: "",
        defaultModel: "",
        isActive: false,
        config: { ...PROVIDER_TYPES.anthropic.defaultConfig },
      },
    ];
  }

  // ── Migration from old ollama_* keys ─────────────────────
  function migrateOldStorage() {
    const oldKeys = [
      "ollama_chats",
      "ollama_current_chat_id",
      "ollama_show_metrics",
      "ollama_tools_enabled",
      "ollama_web_search",
      "ollama_jina_key",
      "ollama_search_provider",
      "ollama_searxng_url",
      "ollama_system_prompt",
      "ollama_config_params",
    ];

    let migrated = false;
    oldKeys.forEach(function (oldKey) {
      const val = localStorage.getItem(oldKey);
      if (val !== null) {
        const newKey = oldKey.replace("ollama_", "aether_");
        if (localStorage.getItem(newKey) === null) {
          localStorage.setItem(newKey, val);
        }
        localStorage.removeItem(oldKey);
        migrated = true;
      }
    });

    // Check if providers already exist
    if (localStorage.getItem(KEYS.providers) === null) {
      const providers = createDefaultProviders();
      localStorage.setItem(KEYS.providers, JSON.stringify(providers));
      localStorage.setItem(KEYS.activeProviderId, "ollama-local");
      migrated = true;
    }

    return migrated;
  }

  // ── Remember API Keys Helpers ──────────────────────────────
  function getRememberApiKeys() {
    var val = localStorage.getItem(KEYS.rememberApiKeys);
    // Default: true (remember/keep keys)
    return val !== "false";
  }

  function setRememberApiKeys(enabled) {
    if (enabled) {
      localStorage.setItem(KEYS.rememberApiKeys, "true");
    } else {
      localStorage.setItem(KEYS.rememberApiKeys, "false");
    }
  }

  /**
   * Restore session-only keys from sessionStorage into in-memory map.
   * Called on boot so keys survive page refreshes (but not tab closure).
   */
  function initSessionOnlyKeys() {
    if (getRememberApiKeys()) {
      _sessionOnlyKeys = {};
      return;
    }
    try {
      var raw = sessionStorage.getItem(KEYS.sessionApiKeys);
      if (raw) {
        _sessionOnlyKeys = JSON.parse(raw);
      }
    } catch (e) {
      _sessionOnlyKeys = {};
    }
  }

  /**
   * Persist the in-memory session-only keys to sessionStorage.
   */
  function flushSessionOnlyKeys() {
    if (getRememberApiKeys()) {
      // Not in session-only mode — clear any stale keys
      _sessionOnlyKeys = {};
      try { sessionStorage.removeItem(KEYS.sessionApiKeys); } catch (e) {}
      return;
    }
    try {
      var keys = {};
      for (var k in _sessionOnlyKeys) {
        if (_sessionOnlyKeys.hasOwnProperty(k) && _sessionOnlyKeys[k]) {
          keys[k] = _sessionOnlyKeys[k];
        }
      }
      if (Object.keys(keys).length > 0) {
        sessionStorage.setItem(KEYS.sessionApiKeys, JSON.stringify(keys));
      } else {
        sessionStorage.removeItem(KEYS.sessionApiKeys);
      }
    } catch (e) {}
  }

  /** Strip apiKey from a provider and store it separately. */
  function saveApiKeySeparately(id, apiKey) {
    _sessionOnlyKeys[id] = apiKey || "";
    flushSessionOnlyKeys();
  }

  /** Get stored apiKey for a provider id. */
  function getStoredApiKey(id) {
    var key = _sessionOnlyKeys[id];
    if (key !== undefined) return key;
    // Fallback: check if it's in sessionStorage directly
    try {
      var raw = sessionStorage.getItem(KEYS.sessionApiKeys);
      if (raw) {
        var parsed = JSON.parse(raw);
        return parsed[id] || "";
      }
    } catch (e) {}
    return "";
  }

  /** Remove apiKey tracking for a provider. */
  function removeApiKeyEntry(id) {
    delete _sessionOnlyKeys[id];
    flushSessionOnlyKeys();
  }

  /** Sanitize providers array: strip apiKey from each when remember is off. */
  function sanitizeProvidersForStorage(rawProviders) {
    if (getRememberApiKeys()) return rawProviders;
    // Deep clone to avoid mutating the argument
    var stripped = rawProviders.map(function (p) {
      var copy = {};
      for (var k in p) {
        if (p.hasOwnProperty(k) && k !== "apiKey") {
          copy[k] = p[k];
        }
      }
      return copy;
    });
    return stripped;
  }

  /** Restore apiKeys from session-only storage into a providers array. */
  function restoreApiKeys(providers) {
    if (getRememberApiKeys()) return providers;
    return providers.map(function (p) {
      var key = getStoredApiKey(p.id);
      if (key) {
        return Object.assign({}, p, { apiKey: key });
      }
      return p;
    });
  }

  // ── Provider CRUD ─────────────────────────────────────────
  function loadProviders() {
    try {
      const raw = localStorage.getItem(KEYS.providers);
      if (!raw) return createDefaultProviders();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return createDefaultProviders();
      }
      // Restore apiKeys from session-only storage if remember is off
      return restoreApiKeys(parsed);
    } catch (e) {
      return createDefaultProviders();
    }
  }

  function saveProviders(providers) {
    // Save separately any apiKeys if remember is off
    if (!getRememberApiKeys()) {
      providers.forEach(function (p) {
        if (p.apiKey) {
          saveApiKeySeparately(p.id, p.apiKey);
        }
      });
    }
    localStorage.setItem(KEYS.providers, JSON.stringify(sanitizeProvidersForStorage(providers)));
  }

  function getActiveProviderId() {
    return localStorage.getItem(KEYS.activeProviderId) || "ollama-local";
  }

  function setActiveProviderId(id) {
    localStorage.setItem(KEYS.activeProviderId, id);
  }

  function getActiveProvider() {
    const providers = loadProviders();
    const activeId = getActiveProviderId();
    return providers.find(function (p) {
      return p.id === activeId;
    }) || providers[0];
  }

  function getProviderById(id) {
    const providers = loadProviders();
    return providers.find(function (p) {
      return p.id === id;
    }) || null;
  }

  // ── Base URL Validation ─────────────────────────────────
  /**
   * Validate and sanitize a provider base URL.
   * Returns { valid: boolean, sanitized?: string, error?: string, warning?: string }
   *
   * - Checks scheme is http:// or https://
   * - Strips embedded credentials (user:pass@)
   * - Warns if host is unusual (not local/private/common API)
   */
  function validateBaseUrl(url) {
    if (!url || typeof url !== "string") {
      return { valid: false, error: "Base URL is required" };
    }
    url = url.trim();

    if (!/^https?:\/\//i.test(url)) {
      return { valid: false, error: "Base URL must start with http:// or https://" };
    }

    // Strip credentials (user:pass@) — keep scheme intact
    var sanitized = url.replace(/^(https?:\/\/)[^@]+@/, "$1");

    // Warn about unusual hostnames
    var warning = null;
    try {
      var hostname = new URL(sanitized).hostname;
      var isLocal = /^(localhost|127\.\d+\.\d+\.\d+|::1|0\.0\.0\.0)$/i.test(hostname);
      var isPrivate = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(hostname);
      var isCommonAPI = /(openai\.com|anthropic\.com|googleapis\.com|opencode\.ai|azure\.com|aws\.com|github\.com|huggingface\.co)$/i.test(hostname);

      if (!isLocal && !isPrivate && !isCommonAPI) {
        warning = 'Warning: Host "' + hostname + '" is not a common API endpoint. Verify this URL is correct.';
      }
    } catch (e) {
      return { valid: false, error: "Invalid URL format" };
    }

    return { valid: true, sanitized: sanitized, warning: warning };
  }

  function addProvider(providerConfig) {
    if (providerConfig && providerConfig.baseUrl) {
      var result = validateBaseUrl(providerConfig.baseUrl);
      if (result.valid) {
        providerConfig.baseUrl = result.sanitized;
      }
    }
    const providers = loadProviders();
    providers.push(providerConfig);
    saveProviders(providers);
    return providerConfig;
  }

  function updateProvider(id, updates) {
    if (updates && updates.baseUrl) {
      var result = validateBaseUrl(updates.baseUrl);
      if (result.valid) {
        updates.baseUrl = result.sanitized;
      }
    }
    const providers = loadProviders();
    var found = false;
    providers.forEach(function (p, i) {
      if (p.id === id) {
        providers[i] = Object.assign({}, p, updates);
        found = true;
      }
    });
    if (found) saveProviders(providers);
    return found;
  }

  function removeProvider(id) {
    var providers = loadProviders();
    providers = providers.filter(function (p) {
      return p.id !== id;
    });
    if (providers.length === 0) {
      providers = createDefaultProviders();
    }
    saveProviders(providers);
    // Clean up session-only apiKey entry
    removeApiKeyEntry(id);
    // If active provider was removed, switch to first
    if (getActiveProviderId() === id) {
      setActiveProviderId(providers[0].id);
    }
  }

  // ── Parameter Field Definitions per Provider Type ────────
  const PARAM_FIELD_DEFS = {
    ollama: [
      { key: 'temperature', label: 'Temperature', type: 'number', step: 0.1, min: 0, max: 2, defaultValue: 0.7 },
      { key: 'num_ctx', label: 'Context Size', type: 'number', step: 1024, min: 2048, max: 131072, defaultValue: 16384, integer: true },
      { key: 'top_p', label: 'Top P', type: 'number', step: 0.05, min: 0, max: 1, defaultValue: 0.9 },
      { key: 'top_k', label: 'Top K', type: 'number', step: 1, min: 0, max: 100, defaultValue: 40, integer: true },
    ],
    openai: [
      { key: 'temperature', label: 'Temperature', type: 'number', step: 0.1, min: 0, max: 2, defaultValue: 0.7 },
      { key: 'max_tokens', label: 'Max Tokens', type: 'number', step: 1, min: 1, max: 131072, defaultValue: 4096, integer: true },
      { key: 'top_p', label: 'Top P', type: 'number', step: 0.05, min: 0, max: 1, defaultValue: 0.9 },
    ],
    anthropic: [
      { key: 'temperature', label: 'Temperature', type: 'number', step: 0.1, min: 0, max: 1, defaultValue: 0.7 },
      { key: 'max_tokens', label: 'Max Tokens', type: 'number', step: 1, min: 1, max: 200000, defaultValue: 4096, integer: true },
    ],
    "opencode-go": [
      { key: 'temperature', label: 'Temperature', type: 'number', step: 0.1, min: 0, max: 2, defaultValue: 0.7 },
      { key: 'max_tokens', label: 'Max Tokens', type: 'number', step: 1, min: 1, max: 131072, defaultValue: 4096, integer: true },
      { key: 'top_p', label: 'Top P', type: 'number', step: 0.05, min: 0, max: 1, defaultValue: 0.9 },
    ],
  };

  function getParamFieldDefs(providerType) {
    return PARAM_FIELD_DEFS[providerType] || [];
  }

  function normalizeProviderConfig(providerType, rawConfig) {
    const fields = getParamFieldDefs(providerType);
    const result = {};
    const base = rawConfig && typeof rawConfig === "object" ? rawConfig : {};
    fields.forEach(function (f) {
      var val = base[f.key];
      if (val !== undefined && val !== null && val !== "") {
        var parsed = f.integer ? Number.parseInt(val, 10) : Number.parseFloat(val);
        if (Number.isFinite(parsed)) {
          var clamped = Math.min(f.max, Math.max(f.min, parsed));
          result[f.key] = f.integer ? Math.round(clamped) : clamped;
        } else {
          result[f.key] = f.defaultValue;
        }
      } else {
        result[f.key] = f.defaultValue;
      }
    });
    return result;
  }

  function getSupportedOptions(providerType) {
    var typeDef = PROVIDER_TYPES[providerType];
    return typeDef ? Object.keys(typeDef.defaultConfig) : [];
  }

  function getProviderTypeLabel(providerType) {
    var typeDef = PROVIDER_TYPES[providerType];
    return typeDef ? typeDef.label : providerType;
  }

  // ── Export ────────────────────────────────────────────────
  app.providers = {
    KEYS: KEYS,
    PROVIDER_TYPES: PROVIDER_TYPES,
    PARAM_FIELD_DEFS: PARAM_FIELD_DEFS,
    migrateOldStorage: migrateOldStorage,
    loadProviders: loadProviders,
    saveProviders: saveProviders,
    getActiveProviderId: getActiveProviderId,
    setActiveProviderId: setActiveProviderId,
    getActiveProvider: getActiveProvider,
    getProviderById: getProviderById,
    validateBaseUrl: validateBaseUrl,
    addProvider: addProvider,
    updateProvider: updateProvider,
    removeProvider: removeProvider,
    getSupportedOptions: getSupportedOptions,
    getProviderTypeLabel: getProviderTypeLabel,
    getParamFieldDefs: getParamFieldDefs,
    normalizeProviderConfig: normalizeProviderConfig,
    createDefaultProviders: createDefaultProviders,
    // Session-only key helpers
    getRememberApiKeys: getRememberApiKeys,
    setRememberApiKeys: setRememberApiKeys,
    initSessionOnlyKeys: initSessionOnlyKeys,
    saveApiKeySeparately: saveApiKeySeparately,
    getStoredApiKey: getStoredApiKey,
    removeApiKeyEntry: removeApiKeyEntry,
  };

  // Run migration on init
  migrateOldStorage();
  // Load session-only keys from sessionStorage
  initSessionOnlyKeys();
})(window);
