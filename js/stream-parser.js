(function (window) {
  "use strict";

  const app = (window.AetherApp = window.AetherApp || {});

  // ── Ollama NDJSON Parser ─────────────────────────────────
  // Each line is a complete JSON object. Streaming is handled by
  // buffering partial lines and splitting on newlines.
  function createOllamaParser() {
    let buffer = "";

    function parseChunk(chunk, flush) {
      chunk = chunk || "";
      const result = {
        text: "",
        thinking: "",
        toolCalls: [],
        done: false,
        metrics: null,
        _context: null,
      };

      buffer += chunk;
      const lines = flush
        ? buffer.split("\n")
        : (function () {
            const parts = buffer.split("\n");
            buffer = parts.pop() || "";
            return parts;
          })();

      lines.forEach(function (rawLine) {
        const line = rawLine.trim();
        if (!line) return;
        try {
          const json = JSON.parse(line);

          if (json.message) {
            if (json.message.content) {
              result.text += json.message.content;
            }
            if (json.message.thinking) {
              result.thinking += json.message.thinking;
            }
            if (json.message.tool_calls) {
              result.toolCalls = result.toolCalls.concat(
                json.message.tool_calls,
              );
            }
          }
          if (json.thinking) {
            result.thinking += json.thinking;
          }

          if (json.done) {
            result.done = true;
            if (json.total_duration != null) {
              result.metrics = {
                total_duration: json.total_duration,
                load_duration: json.load_duration,
                prompt_eval_duration: json.prompt_eval_duration,
                eval_duration: json.eval_duration,
                eval_count: json.eval_count,
                prompt_eval_count: json.prompt_eval_count,
              };
            }
            if (Array.isArray(json.context)) {
              result._context = json.context.slice(0, 20);
            }
          }
        } catch (e) {
          console.warn(
            "[OllamaParser] Skipping malformed line",
            rawLine.slice(0, 200),
            e,
          );
        }
      });

      return result;
    }

    function reset() {
      buffer = "";
    }

    return { parseChunk: parseChunk, reset: reset };
  }

  // ── OpenAI SSE Parser ────────────────────────────────────
  // Standard SSE: 'data: {...}\n\n' lines, with '[DONE]' end signal.
  // Also handles extended formats that include 'thinking' in delta.
  function createOpenAIParser() {
    let buffer = "";

    function parseChunk(chunk, flush) {
      chunk = chunk || "";
      const result = {
        text: "",
        thinking: "",
        toolCalls: [],
        done: false,
        metrics: null,
      };

      buffer += chunk;

      const parts = flush
        ? [buffer]
        : (function () {
            const p = buffer.split("\n\n");
            buffer = p.pop() || "";
            return p;
          })();

      parts.forEach(function (block) {
        if (!block.trim()) return;
        processBlock(block, result);
      });

      return result;
    }

    function processBlock(block, result) {
      var dataValues = [];
      var lines = block.split("\n");

      lines.forEach(function (line) {
        if (line.startsWith("data: ")) {
          dataValues.push(line.substring(6));
        } else if (line.startsWith("data:")) {
          dataValues.push(line.substring(5));
        }
      });

      dataValues.forEach(function (dataStr) {
        dataStr = dataStr.trim();
        if (dataStr === "[DONE]") {
          result.done = true;
          return;
        }
        if (!dataStr) return;

        try {
          var json = JSON.parse(dataStr);

          // API-level error
          if (json.error) {
            console.error("[OpenAIParser] API error:", json.error);
            return;
          }

          var choices = json.choices;
          if (Array.isArray(choices) && choices.length > 0) {
            var delta = choices[0].delta || {};

            if (delta.content) {
              result.text += delta.content;
            }
            if (delta.thinking) {
              result.thinking += delta.thinking;
            }
            if (delta.tool_calls) {
              result.toolCalls = result.toolCalls.concat(delta.tool_calls);
            }

            // finish_reason signals logical end
            if (choices[0].finish_reason) {
              result.done = true;
            }
          }

          // Usage from final chunk
          if (json.usage) {
            result.metrics = {
              total_duration: null,
              load_duration: null,
              prompt_eval_duration: null,
              eval_duration: null,
              eval_count: json.usage.completion_tokens || null,
              prompt_eval_count: json.usage.prompt_tokens || null,
            };
          }
        } catch (e) {
          console.warn(
            "[OpenAIParser] Skipping malformed SSE data",
            dataStr.slice(0, 200),
            e,
          );
        }
      });
    }

    function reset() {
      buffer = "";
    }

    return { parseChunk: parseChunk, reset: reset };
  }

  // ── Anthropic SSE Parser ─────────────────────────────────
  // Event-based SSE: 'event: X\ndata: {...}\n\n'.
  // Handles: content_block_delta (text/thinking), message_stop, etc.
  function createAnthropicParser() {
    let buffer = "";
    let pendingToolCalls = {};

    function parseChunk(chunk, flush) {
      chunk = chunk || "";
      const result = {
        text: "",
        thinking: "",
        toolCalls: [],
        done: false,
        metrics: null,
      };

      buffer += chunk;

      const parts = flush
        ? [buffer]
        : (function () {
            const p = buffer.split("\n\n");
            buffer = p.pop() || "";
            return p;
          })();

      parts.forEach(function (block) {
        if (!block.trim()) return;
        processBlock(block, result);
      });

      return result;
    }

    function processBlock(block, result) {
      var eventType = "";
      var dataStr = "";
      var lines = block.split("\n");

      lines.forEach(function (line) {
        if (line.startsWith("event: ")) {
          eventType = line.substring(7).trim();
        } else if (line.startsWith("data: ")) {
          dataStr = line.substring(6);
        } else if (line.startsWith("data:")) {
          dataStr = line.substring(5);
        }
      });

      if (!dataStr) return;

      try {
        var json = JSON.parse(dataStr);

        switch (eventType) {
          case "content_block_delta":
            if (json.delta) {
              if (json.delta.type === "text_delta" && json.delta.text) {
                result.text += json.delta.text;
              } else if (
                json.delta.type === "thinking_delta" &&
                json.delta.thinking
              ) {
                result.thinking += json.delta.thinking;
              } else if (
                json.delta.type === "input_json_delta" &&
                json.delta.partial_json != null
              ) {
                // Accumulate partial JSON for tool use
                var idx = json.index != null ? json.index : 0;
                if (!pendingToolCalls[idx]) {
                  pendingToolCalls[idx] = { inputJson: "" };
                }
                pendingToolCalls[idx].inputJson += json.delta.partial_json;
              }
            }
            break;

          case "content_block_start":
            if (json.content_block) {
              if (json.content_block.type === "text" && json.content_block.text) {
                result.text += json.content_block.text;
              } else if (json.content_block.type === "tool_use") {
                // Start tracking a tool call
                var idx = json.index != null ? json.index : 0;
                pendingToolCalls[idx] = {
                  id: json.content_block.id || "",
                  name: json.content_block.name || "",
                  inputJson: "",
                };
              }
            }
            break;

          case "content_block_stop":
            // Finalize tool call if pending at this index
            var stopIdx = json.index != null ? json.index : 0;
            if (pendingToolCalls[stopIdx]) {
              var tc = pendingToolCalls[stopIdx];
              var input = {};
              if (tc.inputJson) {
                try {
                  input = JSON.parse(tc.inputJson);
                } catch (e) {
                  console.warn("[AnthropicParser] Failed to parse tool input JSON:", tc.inputJson, e);
                  input = {};
                }
              }
              result.toolCalls.push({
                id: tc.id,
                type: "function",
                function: {
                  name: tc.name,
                  arguments: JSON.stringify(input),
                },
              });
              delete pendingToolCalls[stopIdx];
            }
            break;

          case "message_delta":
            if (json.delta && json.delta.stop_reason) {
              result.done = true;
            }
            if (json.usage) {
              result.metrics = {
                total_duration: null,
                load_duration: null,
                prompt_eval_duration: null,
                eval_duration: null,
                eval_count: json.usage.output_tokens || null,
                prompt_eval_count: json.usage.input_tokens || null,
              };
            }
            break;

          case "message_stop":
            result.done = true;
            // Flush any remaining pending tool calls
            Object.keys(pendingToolCalls).forEach(function (key) {
              var tc = pendingToolCalls[key];
              if (tc && tc.name) {
                var input = {};
                if (tc.inputJson) {
                  try {
                    input = JSON.parse(tc.inputJson);
                  } catch (e) {
                    input = {};
                  }
                }
                result.toolCalls.push({
                  id: tc.id,
                  type: "function",
                  function: {
                    name: tc.name,
                    arguments: JSON.stringify(input),
                  },
                });
              }
              delete pendingToolCalls[key];
            });
            break;

          case "message_start":
          case "ping":
            // No content to extract
            break;

          case "error":
            console.error("[AnthropicParser] API error:", json);
            break;
        }
      } catch (e) {
        console.warn(
          "[AnthropicParser] Skipping malformed SSE data",
          dataStr.slice(0, 200),
          e,
        );
      }
    }

    function reset() {
      buffer = "";
      pendingToolCalls = {};
    }

    return { parseChunk: parseChunk, reset: reset };
  }

  // ── Factory ───────────────────────────────────────────────
  function createStreamParser(providerType) {
    switch (providerType) {
      case "ollama":
        return createOllamaParser();
      case "openai":
        return createOpenAIParser();
      case "anthropic":
        return createAnthropicParser();
      case "opencode-go":
        return createOpenAIParser();
      default:
        console.warn(
          '[StreamParser] Unknown type "' +
            providerType +
            '"; falling back to Ollama NDJSON',
        );
        return createOllamaParser();
    }
  }

  // ── Export ────────────────────────────────────────────────
  app.streamParser = {
    createStreamParser: createStreamParser,

    /// Alias for Anthropic adapter compatibility
    createParser: createStreamParser,
  };
})(window);
