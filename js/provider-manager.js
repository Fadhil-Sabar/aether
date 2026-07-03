(function (window) {
  "use strict";

  const app = (window.AetherApp = window.AetherApp || {});

  // ── Storage Keys ──────────────────────────────────────────
  const KEYS = {
    providers: "aether_providers",
    activeProviderId: "aether_active_provider_id",
  };

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

  // ── Provider CRUD ─────────────────────────────────────────
  function loadProviders() {
    try {
      const raw = localStorage.getItem(KEYS.providers);
      if (!raw) return createDefaultProviders();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return createDefaultProviders();
      }
      return parsed;
    } catch (e) {
      return createDefaultProviders();
    }
  }

  function saveProviders(providers) {
    localStorage.setItem(KEYS.providers, JSON.stringify(providers));
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

  function addProvider(providerConfig) {
    const providers = loadProviders();
    providers.push(providerConfig);
    saveProviders(providers);
    return providerConfig;
  }

  function updateProvider(id, updates) {
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
    addProvider: addProvider,
    updateProvider: updateProvider,
    removeProvider: removeProvider,
    getSupportedOptions: getSupportedOptions,
    getProviderTypeLabel: getProviderTypeLabel,
    getParamFieldDefs: getParamFieldDefs,
    normalizeProviderConfig: normalizeProviderConfig,
    createDefaultProviders: createDefaultProviders,
  };

  // Run migration on init
  migrateOldStorage();
})(window);
