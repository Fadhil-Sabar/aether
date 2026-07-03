(function (window) {
  "use strict";
  const app = (window.AetherApp = window.AetherApp || {});

  // ── NDJSON parser (lightweight, self-contained) ────────────
  function parseNdjson(buffer, flush) {
    const lines = String(buffer || "").split("\n");
    const remainder = flush ? "" : lines.pop() || "";
    const objects = [];
    lines.forEach(function (rawLine) {
      const line = rawLine.trim();
      if (!line) return;
      try {
        objects.push(JSON.parse(line));
      } catch (e) {
        console.warn("Ollama adapter: skipping malformed NDJSON line", line.slice(0, 200), e);
      }
    });
    return { objects: objects, remainder: remainder };
  }

  function processNdjsonObject(json, callbacks) {
    if (json.message) {
      if (json.message.content) {
        callbacks.onContent(json.message.content);
      }
      if (json.message.thinking) {
        callbacks.onThinking(json.message.thinking);
      }
      if (json.message.tool_calls) {
        callbacks.onToolCalls(json.message.tool_calls);
      }
    }
    if (json.thinking) {
      callbacks.onThinking(json.thinking);
    }
    if (json.done) {
      const metadata = {};
      if (Array.isArray(json.context)) {
        metadata.context = json.context.slice(0, 20);
      }
      if (json.total_duration) {
        metadata.metrics = {
          total_duration: json.total_duration,
          load_duration: json.load_duration,
          prompt_eval_duration: json.prompt_eval_duration,
          eval_duration: json.eval_duration,
          eval_count: json.eval_count,
          prompt_eval_count: json.prompt_eval_count,
        };
      }
      callbacks.onDone(metadata);
    }
  }

  // ── Adapter ────────────────────────────────────────────────
  const OLLAMA_ADAPTER = {
    type: "ollama",

    fetchModels: async function (baseUrl, _apiKey) {
      const response = await fetch(baseUrl + "/api/tags");
      if (!response.ok) {
        throw new Error("Failed to fetch models: HTTP " + response.status);
      }
      const data = await response.json();
      return (data.models || []).map(function (m) {
        return { name: m.name };
      });
    },

    chat: async function (baseUrl, _apiKey, messages, options, callbacks, signal) {
      const model = options.model;
      const tools = options.tools;
      const think = options.think;
      const config = options.config || {};
      const safeCallbacks = callbacks || {};

      // Ensure required callbacks exist as no-ops
      if (!safeCallbacks.onContent) safeCallbacks.onContent = function () {};
      if (!safeCallbacks.onThinking) safeCallbacks.onThinking = function () {};
      if (!safeCallbacks.onToolCalls) safeCallbacks.onToolCalls = function () {};
      if (!safeCallbacks.onDone) safeCallbacks.onDone = function () {};

      const body = {
        model: model,
        messages: messages,
        stream: true,
        options: {
          temperature: config.temperature,
          num_ctx: config.num_ctx,
          top_p: config.top_p,
          top_k: config.top_k,
        },
      };

      if (tools) {
        body.tools = JSON.parse(JSON.stringify(tools));
      }
      if (think !== undefined && think !== false) {
        body.think = think;
      }

      const response = await fetch(baseUrl + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: signal,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        var errBody = {};
        try {
          errBody = await response.json();
        } catch (_) {}
        throw new Error(errBody.error || "HTTP Error " + response.status);
      }

      if (!response.body) {
        throw new Error("Streaming response body is unavailable");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      var buffer = "";

      while (true) {
        var result = await reader.read();
        var chunkValue = result.value;
        var chunkDone = result.done;

        if (chunkDone) {
          buffer += decoder.decode();
          var flushed = parseNdjson(buffer, true);
          flushed.objects.forEach(function (obj) {
            processNdjsonObject(obj, safeCallbacks);
          });
          break;
        }

        buffer += decoder.decode(chunkValue, { stream: true });
        var parsed = parseNdjson(buffer, false);
        buffer = parsed.remainder;
        parsed.objects.forEach(function (obj) {
          processNdjsonObject(obj, safeCallbacks);
        });
      }
    },

    getSupportedOptions: function () {
      return [
        { key: "temperature", label: "Temperature", type: "number", default: 0.7, min: 0, max: 2, step: 0.1 },
        { key: "num_ctx", label: "Context Size", type: "number", default: 16384, min: 2048, max: 131072, step: 1024 },
        { key: "top_p", label: "Top P", type: "number", default: 0.9, min: 0, max: 1, step: 0.05 },
        { key: "top_k", label: "Top K", type: "number", default: 40, min: 0, max: 100, step: 1 },
      ];
    },
  };

  // ── Register & export ──────────────────────────────────────
  app.adapters.ollama = OLLAMA_ADAPTER;
  app.createOllamaAdapter = function () {
    return OLLAMA_ADAPTER;
  };

})(window);
