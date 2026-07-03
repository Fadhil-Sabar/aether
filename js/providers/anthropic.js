(function (window) {
  "use strict";

  const app = (window.AetherApp = window.AetherApp || {});

  /**
   * Anthropic Adapter
   * Implements the provider interface for Anthropic Claude API.
   */
  const anthropicAdapter = {
    type: "anthropic",
    label: "Anthropic Claude",
    supportedOptions: ["temperature", "max_tokens"],

    getSupportedOptions: function () {
      return [
        { key: "temperature", label: "Temperature", type: "number", default: 0.7, min: 0, max: 2, step: 0.1 },
        { key: "max_tokens", label: "Max Tokens", type: "number", default: 4096, min: 1, max: 128000, step: 1 },
        { key: "top_p", label: "Top P", type: "number", default: 0.9, min: 0, max: 1, step: 0.05 },
        { key: "top_k", label: "Top K", type: "number", default: 40, min: 0, max: 100, step: 1 },
      ];
    },

    /**
     * Fetch available models from Anthropic API
     */
    fetchModels: function (baseUrl, apiKey) {
      var headers = {
        "Content-Type": "application/json",
        "x-api-key": apiKey || "",
        "anthropic-version": "2023-06-01",
      };

      return fetch(baseUrl.replace(/\/+$/, "") + "/models", {
        headers: headers,
      })
        .then(function (response) {
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.json();
        })
        .then(function (data) {
          if (data.data && Array.isArray(data.data)) {
            return data.data.map(function (m) { return m.id || m.name; });
          }
          return [];
        });
    },

    /**
     * Check if model supports extended thinking
     */
    isThinkModel: function (modelName) {
      if (!modelName) return false;
      var lower = modelName.toLowerCase();
      return lower.indexOf("claude-sonnet-4") !== -1 ||
             lower.indexOf("claude-opus-4") !== -1 ||
             lower.indexOf("claude-3.5") !== -1;
    },

    /**
     * Convert OpenAI-style messages to Anthropic format
     */
    _convertMessages: function (messages) {
      var systemPrompt = "";
      var converted = [];

      messages.forEach(function (msg) {
        if (msg.role === "system") {
          systemPrompt += (systemPrompt ? "\n" : "") + msg.content;
        } else if (msg.role === "user") {
          converted.push({
            role: "user",
            content: msg.content,
          });
        } else if (msg.role === "assistant") {
          var content = [];
          if (msg.content) {
            content.push({ type: "text", text: msg.content });
          }
          // Handle tool calls in assistant messages
          if (msg.tool_calls) {
            msg.tool_calls.forEach(function (tc) {
              content.push({
                type: "tool_use",
                id: tc.id || tc.function.name,
                name: tc.function.name,
                input: tc.function.arguments ? JSON.parse(tc.function.arguments) : {},
              });
            });
          }
          converted.push({
            role: "assistant",
            content: content.length > 0 ? content : msg.content,
          });
        } else if (msg.role === "tool") {
          // Tool result
          converted.push({
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: msg.tool_call_id || "",
                content: msg.content,
              },
            ],
          });
        }
      });

      return { messages: converted, system: systemPrompt };
    },

    /**
      * Send a chat request to Anthropic Claude API with streaming
      *
      * Standard adapter contract:
      *   chat(baseUrl, apiKey, messages, options, callbacks, signal)
      *
      * callbacks: { onContent(text), onThinking(text), onToolCalls(calls), onDone(metadata) }
      */
     chat: async function (baseUrl, apiKey, messages, options, callbacks, signal) {
       baseUrl = String(baseUrl || "").replace(/\/+$/, "");
       var model = options.model;
       var tools = options.tools;
       var think = options.think;
       var config = options.config || {};
       var safeCallbacks = callbacks || {};

       if (!safeCallbacks.onContent) safeCallbacks.onContent = function () {};
       if (!safeCallbacks.onThinking) safeCallbacks.onThinking = function () {};
       if (!safeCallbacks.onToolCalls) safeCallbacks.onToolCalls = function () {};
       if (!safeCallbacks.onDone) safeCallbacks.onDone = function () {};

       // Convert messages to Anthropic format
       var converted = this._convertMessages(messages);

       var headers = {
         "Content-Type": "application/json",
         "x-api-key": apiKey || "",
         "anthropic-version": "2023-06-01",
       };

       var body = {
         model: model,
         max_tokens: config.max_tokens || 4096,
         messages: converted.messages,
         stream: true,
       };

       if (config.temperature !== undefined) {
         body.temperature = config.temperature;
       }

       if (converted.system) {
         body.system = converted.system;
       }

       // Add thinking config if applicable
       if (think && think !== "false") {
         body.thinking = {
           type: "enabled",
           budget_tokens: think === "low" ? 1024
                        : think === "medium" ? 4096
                        : think === "high" ? 16384
                        : 2048,
         };
       }

       // Add tools if provided (Anthropic tools format)
       if (tools) {
         body.tools = tools.map(function (t) {
           // Convert from OpenAI tool format to Anthropic if needed
           if (t.type === "function" && t.function) {
             return {
               name: t.function.name,
               description: t.function.description || "",
               input_schema: t.function.parameters || {},
             };
           }
           return t;
         });
       }

       var response;
       try {
         response = await fetch(baseUrl + "/messages", {
           method: "POST",
           headers: headers,
           signal: signal,
           body: JSON.stringify(body),
         });
       } catch (err) {
         if (err.name === "AbortError") {
           // AbortError is expected on user cancellation — don't rethrow
           return;
         }
         throw err;
       }

       if (!response.ok) {
         var errData = {};
         try {
           errData = await response.json();
         } catch (_) {}
         throw new Error(
           (errData.error && errData.error.message) ||
           errData.error ||
           "HTTP Error " + response.status
         );
       }

       if (!response.body) {
         throw new Error("Streaming response body is unavailable");
       }

       var parser = app.streamParser.createParser("anthropic");
       var reader = response.body.getReader();
       var decoder = new TextDecoder();

       while (true) {
         var chunkResult = await reader.read();
         if (chunkResult.done) {
           var flushed = parser.parseChunk(decoder.decode(), true);
           if (flushed.text) safeCallbacks.onContent(flushed.text);
           if (flushed.thinking) safeCallbacks.onThinking(flushed.thinking);
           if (flushed.toolCalls && flushed.toolCalls.length > 0) {
             safeCallbacks.onToolCalls(flushed.toolCalls);
           }
           safeCallbacks.onDone({
             context: flushed._context || [],
             metrics: flushed.metrics || null,
           });
           break;
         }

         var text = decoder.decode(chunkResult.value, { stream: true });
         var parsed = parser.parseChunk(text, false);

         if (parsed.text) safeCallbacks.onContent(parsed.text);
         if (parsed.thinking) safeCallbacks.onThinking(parsed.thinking);
         if (parsed.toolCalls && parsed.toolCalls.length > 0) {
           safeCallbacks.onToolCalls(parsed.toolCalls);
         }

         if (parsed.done) {
           safeCallbacks.onDone({
             context: parsed._context || [],
             metrics: parsed.metrics || null,
           });
           break;
         }
       }
     },
  };

  // Register adapter
  if (!app.adapters) app.adapters = {};
  app.adapters.anthropic = anthropicAdapter;
})(window);
