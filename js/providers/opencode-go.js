(function (window) {
  "use strict";

  const app = (window.AetherApp = window.AetherApp || {});

  // ── Static model list (observed from opencode.ai/zen/go/v1/models) ──
  // These must never be fetched from the browser because the endpoint
  // omits Access-Control-Allow-Origin.
  const MODEL_LIST = [
    "minimax-m3",
    "minimax-m2.7",
    "minimax-m2.5",
    "kimi-k2.7-code",
    "kimi-k2.6",
    "kimi-k2.5",
    "glm-5.2",
    "glm-5.1",
    "glm-5",
    "deepseek-v4-pro",
    "deepseek-v4-flash",
    "qwen3.7-max",
    "qwen3.7-plus",
    "qwen3.6-plus",
    "qwen3.5-plus",
    "mimo-v2-pro",
    "mimo-v2-omni",
    "mimo-v2.5-pro",
    "mimo-v2.5",
    "hy3-preview",
  ];

  // ── OpenCode Go Adapter ─────────────────────────────────
  const OPENCODE_GO_ADAPTER = {
    type: "opencode-go",

    fetchModels: async function () {
      return MODEL_LIST.map(function (name) {
        return { name: name };
      });
    },

    chat: async function () {
      throw new Error("OpenCode Go does not allow direct browser chat requests; use a same-origin proxy or another CORS-enabled provider");
    },

    getSupportedOptions: function () {
      if (app.providers && app.providers.getSupportedOptions) {
        return app.providers.getSupportedOptions("opencode-go");
      }
      return [];
    },

    isThinkModel: function (model) {
      const name = String(model || "").toLowerCase();
      return /qwen|deepseek|glm|kimi|minimax/.test(name);
    },
  };

  // ── Register on the adapters registry ──────────────────
  if (!app.adapters) app.adapters = {};
  app.adapters["opencode-go"] = OPENCODE_GO_ADAPTER;

})(window);
