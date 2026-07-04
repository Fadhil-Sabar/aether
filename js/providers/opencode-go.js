(function (window) {
  "use strict";

  const app = (window.AetherApp = window.AetherApp || {});

  // ── Static model list (observed from opencode.ai/zen/go/v1/models) ──
  const MODEL_LIST = [
    "minimax-m3", "minimax-m2.7", "minimax-m2.5",
    "kimi-k2.7-code", "kimi-k2.6", "kimi-k2.5",
    "glm-5.2", "glm-5.1", "glm-5",
    "deepseek-v4-pro", "deepseek-v4-flash",
    "qwen3.7-max", "qwen3.7-plus", "qwen3.6-plus", "qwen3.5-plus",
    "mimo-v2-pro", "mimo-v2-omni", "mimo-v2.5-pro", "mimo-v2.5",
    "hy3-preview",
  ];

  // ── OpenCode Go Adapter (proxy via same-origin server.py) ──
  const OPENCODE_GO_ADAPTER = {
    type: "opencode-go",

    fetchModels: async function () {
      // Try dynamic fetch via proxy first, fallback to static list
      try {
        var resp = await fetch("/api/models", { signal: AbortSignal.timeout(5000) });
        if (resp.ok) {
          var data = await resp.json();
          if (data.models && data.models.length > 0) {
            return data.models.map(function (name) { return { name: name }; });
          }
        }
      } catch (_) {}
      // Static fallback
      return MODEL_LIST.map(function (name) {
        return { name: name };
      });
    },

    /**
     * Chat via same-origin proxy (/api/chat).
     * Proxy handles CORS + forwards to opencode.ai.
     */
    chat: async function (baseUrl, apiKey, messages, options, callbacks, signal) {
      var safeCallbacks = callbacks || {};
      if (!safeCallbacks.onContent) safeCallbacks.onContent = function () {};
      if (!safeCallbacks.onThinking) safeCallbacks.onThinking = function () {};
      if (!safeCallbacks.onToolCalls) safeCallbacks.onToolCalls = function () {};
      if (!safeCallbacks.onDone) safeCallbacks.onDone = function () {};

      var config = options.config || {};
      var body = {
        model: options.model,
        messages: messages,
        stream: true,
        temperature: config.temperature != null ? config.temperature : 0.7,
        max_tokens: config.max_tokens || 4096,
      };
      if (config.top_p != null) body.top_p = config.top_p;
      if (options.tools) body.tools = options.tools;

      var response;
      try {
        response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": apiKey || "",
          },
          signal: signal,
          body: JSON.stringify(body),
        });
      } catch (err) {
        if (err.name === "AbortError") return;
        throw err;
      }

      if (!response.ok) {
        var errData = {};
        try { errData = await response.json(); } catch (_) {}
        throw new Error(
          (errData.error && errData.error.message) ||
          errData.error ||
          "HTTP Error " + response.status
        );
      }

      // Parse SSE stream (OpenAI-compatible format)
      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      var buffer = "";

      while (true) {
        var chunkResult = await reader.read();
        if (chunkResult.done) {
          // Flush remaining buffer
          if (buffer.trim()) processSSELine(buffer, safeCallbacks, true);
          safeCallbacks.onDone({ metrics: null, context: null });
          break;
        }

        buffer += decoder.decode(chunkResult.value, { stream: true });
        var lines = buffer.split("\n");
        // Keep incomplete line in buffer
        buffer = lines.pop() || "";

        for (var i = 0; i < lines.length; i++) {
          processSSELine(lines[i], safeCallbacks, false);
        }
      }
    },

    getSupportedOptions: function () {
      if (app.providers && app.providers.getSupportedOptions) {
        return app.providers.getSupportedOptions("opencode-go");
      }
      return [];
    },

    isThinkModel: function (model) {
      var name = String(model || "").toLowerCase();
      return /qwen|deepseek|glm|kimi|minimax/.test(name);
    },
  };

  // ── SSE line processor (OpenAI-compatible) ──
  function processSSELine(line, callbacks, isFlush) {
    var trimmed = line.trim();
    if (!trimmed) return;

    if (trimmed === "data: [DONE]") {
      return;
    }

    if (!trimmed.startsWith("data: ")) return;

    var dataStr = trimmed.substring(6);
    try {
      var json = JSON.parse(dataStr);
    } catch (e) {
      return;
    }

    if (json.error) {
      console.error("[OpenCodeGo] API error:", json.error);
      return;
    }

    var choices = json.choices;
    if (!Array.isArray(choices) || choices.length === 0) return;

    var delta = choices[0].delta || {};

    if (delta.content) {
      callbacks.onContent(delta.content);
    }
    if (delta.thinking) {
      callbacks.onThinking(delta.thinking);
    }
    if (delta.tool_calls) {
      callbacks.onToolCalls(delta.tool_calls);
    }

    if (choices[0].finish_reason) {
      // Don't call onDone here — let the stream end naturally
    }
  }

  // ── Register ──
  if (!app.adapters) app.adapters = {};
  app.adapters["opencode-go"] = OPENCODE_GO_ADAPTER;

})(window);
