(function (window) {
  "use strict";

  const app = (window.AetherApp = window.AetherApp || {});

  // ── SSE Stream Parser ──────────────────────────────────
  // OpenAI-compatible APIs use Server-Sent Events for streaming.
  // Each message is a line "data: {...}" separated by \n\n.
  // End-of-stream marker: "data: [DONE]"
  function parseSSEStream(buffer, flush) {
    const parts = String(buffer || "").split("\n\n");
    const remainder = flush ? "" : parts.pop() || "";
    const objects = [];

    parts.forEach(function (block) {
      const lines = block.split("\n");
      lines.forEach(function (line) {
        line = line.trim();
        if (!line) return;
        if (line === "data: [DONE]") return;
        if (!line.startsWith("data: ")) return;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) return;
        try {
          objects.push(JSON.parse(jsonStr));
        } catch (e) {
          console.warn("openai SSE: skipping malformed chunk", jsonStr.slice(0, 200), e);
        }
      });
    });

    return { objects: objects, remainder: remainder };
  }

  // ── Accumulate streaming tool calls by index ────────────
  // OpenAI streams tool_calls incrementally:
  //   chunk 1 -> {index:0, id:"call_xxx", function:{name:"fn", arguments:""}}
  //   chunk 2 -> {index:0, id:null, function:{arguments:"{\"key\":"}}
  //   chunk 3 -> {index:0, id:null, function:{arguments:"\"val\"}"}}
  function accumulateToolCall(acc, deltaToolCall) {
    const idx = deltaToolCall.index;
    if (acc[idx] === undefined) {
      acc[idx] = {
        id: deltaToolCall.id || null,
        type: "function",
        function: {
          name: "",
          arguments: "",
        },
      };
    }
    const entry = acc[idx];
    if (deltaToolCall.id) entry.id = deltaToolCall.id;
    if (deltaToolCall.function) {
      if (deltaToolCall.function.name) {
        entry.function.name += deltaToolCall.function.name;
      }
      if (deltaToolCall.function.arguments) {
        entry.function.arguments += deltaToolCall.function.arguments;
      }
    }
  }

  // ── Normalise OpenAI tool calls to Ollama-style shape ──
  // Ollama format: [{function: {name: "x", arguments: {...}}}]
  // OpenAI format: [{id, type, function: {name, arguments: "json_str"}}]
  function normaliseToolCalls(accum) {
    const result = [];
    const keys = Object.keys(accum).sort(function (a, b) {
      return Number(a) - Number(b);
    });
    keys.forEach(function (k) {
      const tc = accum[k];
      let parsedArgs = {};
      try {
        parsedArgs = JSON.parse(tc.function.arguments);
      } catch (e) {
        parsedArgs = { _raw: tc.function.arguments };
      }
      result.push({
        id: tc.id,
        type: tc.type,
        function: {
          name: tc.function.name,
          arguments: parsedArgs,
        },
      });
    });
    return result;
  }

  // ── OpenAI-Compatible Adapter ───────────────────────────
  const OPENAI_ADAPTER = {
    type: "openai",

    fetchModels: async function (baseUrl, apiKey) {
      const url = String(baseUrl || "").replace(/\/+$/, "") + "/models";
      const headers = { "Content-Type": "application/json" };
      if (apiKey) {
        headers["Authorization"] = "Bearer " + apiKey;
      }

      const response = await fetch(url, { headers: headers });
      if (!response.ok) {
        throw new Error("GET /v1/models returned " + response.status);
      }
      const data = await response.json();
      const models = data.data || [];
      return models
        .map(function (m) {
          var name = m.id || m.model || m.name || "";
          return { name: name };
        })
        .filter(function (m) {
          return m.name.length > 0;
        });
    },

    chat: async function (baseUrl, apiKey, messages, options, callbacks, signal) {
      const url = String(baseUrl || "").replace(/\/+$/, "") + "/chat/completions";
      const headers = { "Content-Type": "application/json" };
      if (apiKey) {
        headers["Authorization"] = "Bearer " + apiKey;
      }

      const config = options.config || {};
      const safeCallbacks = callbacks || {};
      if (!safeCallbacks.onContent) safeCallbacks.onContent = function () {};
      if (!safeCallbacks.onThinking) safeCallbacks.onThinking = function () {};
      if (!safeCallbacks.onToolCalls) safeCallbacks.onToolCalls = function () {};
      if (!safeCallbacks.onDone) safeCallbacks.onDone = function () {};

      const body = {
        model: options.model,
        messages: messages,
        stream: true,
        temperature: config.temperature,
        top_p: config.top_p,
      };

      // OpenAI uses max_tokens (Ollama uses num_ctx)
      if (config.max_tokens !== undefined && config.max_tokens !== null) {
        body.max_tokens = config.max_tokens;
      }

      // Tools pass-through — the app already builds OpenAI-format tools
      if (options.tools && options.tools.length > 0) {
        body.tools = JSON.parse(JSON.stringify(options.tools));
      }

      const response = await fetch(url, {
        method: "POST",
        headers: headers,
        signal: signal,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        var errorData = {};
        try {
          errorData = await response.json();
        } catch (_) {}
        throw new Error(
          (errorData.error && errorData.error.message) ||
            "HTTP Error " + response.status,
        );
      }

      if (!response.body) {
        throw new Error("Streaming response body is unavailable");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      var buffer = "";
      var toolCallAccum = {};
      var usageData = null;

      function processChunk(obj) {
        var choices = obj.choices || [];
        for (var ci = 0; ci < choices.length; ci++) {
          var choice = choices[ci];
          var delta = choice.delta || {};

          if (delta.content) {
            safeCallbacks.onContent(delta.content);
          }

          // Some providers (OpenRouter, Groq, Together) support reasoning_content
          if (delta.reasoning_content) {
            safeCallbacks.onThinking(delta.reasoning_content);
          }
          // Others use thinking field
          if (delta.thinking) {
            safeCallbacks.onThinking(delta.thinking);
          }

          if (delta.tool_calls) {
            const callsToReport = [];
            for (var ti = 0; ti < delta.tool_calls.length; ti++) {
              accumulateToolCall(toolCallAccum, delta.tool_calls[ti]);
            }
          }
        }

        if (obj.usage) {
          usageData = obj.usage;
        }
      }

      // Read the stream
      while (true) {
        var chunkResult = await reader.read();
        if (chunkResult.done) {
          buffer += decoder.decode();
          var parsed = parseSSEStream(buffer, true);
          for (var pi = 0; pi < parsed.objects.length; pi++) {
            processChunk(parsed.objects[pi]);
          }
          break;
        }
        buffer += decoder.decode(chunkResult.value, { stream: true });
        parsed = parseSSEStream(buffer, false);
        buffer = parsed.remainder;
        for (pi = 0; pi < parsed.objects.length; pi++) {
          processChunk(parsed.objects[pi]);
        }
      }

      // Normalise and report tool calls
      var finalToolCalls = normaliseToolCalls(toolCallAccum);
      if (finalToolCalls.length > 0) {
        safeCallbacks.onToolCalls(finalToolCalls);
      }

      // Build metrics (OpenAI usage shape → Ollama-compatible shape)
      var metrics = null;
      if (usageData) {
        metrics = {
          total_duration: 0,
          load_duration: 0,
          prompt_eval_duration: 0,
          eval_duration: 0,
          prompt_eval_count: usageData.prompt_tokens || 0,
          eval_count: usageData.completion_tokens || 0,
          // Extra fields for display
          total_tokens: usageData.total_tokens || 0,
        };
      }

      // Signal completion
      safeCallbacks.onDone({
        metrics: metrics,
        context: [],
      });
    },

    getSupportedOptions: function () {
      return [
        { key: "temperature", label: "Temperature", type: "number", default: 0.7, min: 0, max: 2, step: 0.1 },
        { key: "max_tokens", label: "Max Tokens", type: "number", default: 4096, min: 1, max: 128000, step: 1 },
        { key: "top_p", label: "Top P", type: "number", default: 0.9, min: 0, max: 1, step: 0.05 },
      ];
    },
  };

  // ── Register on the adapters registry ──────────────────
  if (!app.adapters) app.adapters = {};
  app.adapters.openai = OPENAI_ADAPTER;

})(window);
