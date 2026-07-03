(function (window) {
  "use strict";
  const app = (window.AetherApp = window.AetherApp || {});

  // ── Provider Adapter Interface ─────────────────────────────
  //
  // Each provider adapter MUST implement the following methods:
  //
  //   fetchModels(baseUrl, apiKey) => Promise<Array<{name: string}>>
  //     Fetch available models from the provider.
  //     Returns an array of model objects (at minimum { name }).
  //
  //   chat(baseUrl, apiKey, messages, options, callbacks, signal) => Promise<void>
  //     Send a streaming chat/completion request.
  //
  //     options: {
  //       model: string,        // selected model name
  //       tools: Array|null,    // tool definitions (function calling)
  //       think: boolean|string,// thinking/reasoning mode
  //       config: object        // provider-specific config params
  //     }
  //
  //     callbacks: {
  //       onContent(text)       — incremental response text
  //       onThinking(text)      — incremental thinking/reasoning text
  //       onToolCalls(calls)    — array of tool call objects
  //       onDone(metadata)      — { context, metrics } when stream ends
  //     }
  //
  //     Throws on HTTP/network errors.
  //
  //   getSupportedOptions() => Array<{
  //     key: string,    // option key name
  //     label: string,  // human-readable label
  //     type: string,   // 'number' | 'boolean' | 'string'
  //     default: any,   // default value
  //     min?: number,   // numeric min
  //     max?: number,   // numeric max
  //     step?: number   // numeric step
  //   }>
  //     Return metadata for the provider's configurable options.
  //
  // ── Registry ────────────────────────────────────────────────
  //   app.adapters['ollama'] = { fetchModels, chat, getSupportedOptions }
  //
  app.adapters = {};

})(window);
