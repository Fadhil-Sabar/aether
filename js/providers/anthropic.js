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
     */
    chat: function (config) {
      var baseUrl = config.baseUrl.replace(/\/+$/, "");
      var model = config.model;
      var messages = config.messages;
      var options = config.options || {};
      var apiKey = config.apiKey;
      var signal = config.signal;
      var onChunk = config.onChunk || function () {};
      var onDone = config.onDone || function () {};
      var onError = config.onError || function () {};

      // Convert messages to Anthropic format
      var converted = this._convertMessages(messages);

      var headers = {
        "Content-Type": "application/json",
        "x-api-key": apiKey || "",
        "anthropic-version": "2023-06-01",
      };

      var body = {
        model: model,
        max_tokens: options.max_tokens || 4096,
        messages: converted.messages,
        stream: true,
      };

      if (options.temperature !== undefined) {
        body.temperature = options.temperature;
      }

      if (converted.system) {
        body.system = converted.system;
      }

      // Add thinking config if applicable
      if (options.thinkValue && options.thinkValue !== "false") {
        body.thinking = {
          type: "enabled",
          budget_tokens: options.thinkValue === "low" ? 1024
                       : options.thinkValue === "medium" ? 4096
                       : options.thinkValue === "high" ? 16384
                       : 2048,
        };
      }

      // Add tools if provided (Anthropic tools format)
      if (options.tools) {
        body.tools = options.tools.map(function (t) {
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

      return fetch(baseUrl + "/messages", {
        method: "POST",
        headers: headers,
        signal: signal,
        body: JSON.stringify(body),
      })
        .then(function (response) {
          if (!response.ok) {
            return response.json().then(function (errData) {
              throw new Error(
                (errData.error && errData.error.message) ||
                errData.error ||
                "HTTP Error " + response.status
              );
            });
          }
          if (!response.body) {
            throw new Error("Streaming response body is unavailable");
          }

          var parser = app.streamParser.createParser("anthropic");
          var reader = response.body.getReader();
          var decoder = new TextDecoder();

          function readStream() {
            return reader.read().then(function (chunkResult) {
              if (chunkResult.done) {
                var flushed = parser.parseChunk(decoder.decode());
                if (flushed.text || flushed.thinking) {
                  onChunk(flushed);
                }
                onDone(flushed);
                return;
              }

              var text = decoder.decode(chunkResult.value, { stream: true });
              var parsed = parser.parseChunk(text);

              if (parsed.text || parsed.thinking || parsed.toolCalls.length > 0) {
                onChunk(parsed);
              }

              if (parsed.done) {
                onDone(parsed);
                return;
              }

              return readStream();
            });
          }

          return readStream();
        })
        .catch(function (err) {
          if (err.name === "AbortError") {
            onError({ name: "AbortError", message: "Request aborted" });
          } else {
            onError(err);
          }
        });
    },
  };

  // Register adapter
  if (!app.adapters) app.adapters = {};
  app.adapters.anthropic = anthropicAdapter;
})(window);
