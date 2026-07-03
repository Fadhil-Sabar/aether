# Aether Project Analysis

Reviewed on July 3, 2026.

Scope reviewed:

- `index.html`
- `style.css`
- `script.js`
- `js/provider-manager.js`
- `js/state-storage.js`
- `js/chat-controller.js`
- `js/rendering.js`
- `js/search-providers.js`
- `js/stream-parser.js`
- `js/providers/_adapter.js`
- `js/providers/ollama.js`
- `js/providers/openai.js`
- `js/providers/anthropic.js`
- `README.md`
- `PROJECT_OVERVIEW.md`

## Executive Summary

The repository contains two overlapping application architectures:

1. The currently shipped runtime is the monolithic `script.js`, loaded by `index.html` at [index.html](./index.html:387) through [index.html](./index.html:393).
2. A newer modular rewrite exists under `js/`, but key modules such as `js/chat-controller.js`, `js/state-storage.js`, `js/rendering.js`, and `js/search-providers.js` are not loaded by `index.html`.

That split is the main architectural issue in the project. The modular codebase fixes several safety and data-validation problems, but those fixes are not active in the actual app. As a result, the shipped app still has meaningful security, privacy, correctness, and maintainability issues.

The most serious production concerns are:

- External link analysis forwards arbitrary URLs to Jina without blocking localhost/private network targets or asking for confirmation in the shipped runtime: [script.js](./script.js:452), [script.js](./script.js:464), [script.js](./script.js:1107), [script.js](./script.js:1500).
- API keys and chat content are persisted in plain `localStorage`, which is expected for a static app but still a material risk for any XSS or compromised third-party script scenario: [script.js](./script.js:240), [script.js](./script.js:253), [script.js](./script.js:994), [js/provider-manager.js](./js/provider-manager.js:15), [js/provider-manager.js](./js/provider-manager.js:95).
- The app depends on multiple third-party CDNs without integrity pinning and with broad runtime trust: [index.html](./index.html:8), [index.html](./index.html:13), [index.html](./index.html:16), [index.html](./index.html:18), [index.html](./index.html:20), [index.html](./index.html:22).

## 1. Code Quality

### High-impact bugs and correctness issues

- The shipped app uses raw `JSON.parse(localStorage.getItem(...))` without guards. Corrupted browser state can break initialization before the UI recovers: [script.js](./script.js:240), [script.js](./script.js:261). The modular replacement fixes this with `parseJsonText`, `readJson`, and normalization: [js/state-storage.js](./js/state-storage.js:55), [js/state-storage.js](./js/state-storage.js:65), [js/state-storage.js](./js/state-storage.js:200).
- OpenAI streaming parsing in the shipped app is not a valid SSE parser. It splits on single newlines and resets the buffer every read, which can lose fragmented events across chunks: [script.js](./script.js:1357), [script.js](./script.js:1364), [script.js](./script.js:1365), [script.js](./script.js:1366). The modular `openai` adapter fixes this with a proper `\n\n` framed SSE parser: [js/providers/openai.js](./js/providers/openai.js:9), [js/providers/openai.js](./js/providers/openai.js:193).
- Anthropic streaming support in the shipped runtime is incomplete and likely broken for many valid responses. It uses a regex against a live SSE buffer and only extracts one `content_block_delta` shape, ignoring most event framing and tool use: [script.js](./script.js:1467), [script.js](./script.js:1469), [script.js](./script.js:1472), [script.js](./script.js:1480). The modular parser is much more correct: [js/stream-parser.js](./js/stream-parser.js:177), [js/stream-parser.js](./js/stream-parser.js:219).
- Metrics rendering in the shipped app silently drops non-Ollama providers because it requires `metrics.total_duration`, which OpenAI/Anthropic-style usage objects do not provide: [script.js](./script.js:756), [script.js](./script.js:757), [script.js](./script.js:1405). The modular renderer handles missing duration fields better: [js/rendering.js](./js/rendering.js:121).
- Message deletion/editing in the shipped app relies on DOM order instead of message IDs, which is fragile and can desynchronize UI and storage if the message list shape changes: [script.js](./script.js:888), [script.js](./script.js:898), [script.js](./script.js:924). The modular controller fixes this by using stored message IDs: [js/chat-controller.js](./js/chat-controller.js:265), [js/chat-controller.js](./js/chat-controller.js:275), [js/chat-controller.js](./js/chat-controller.js:287).

### Anti-patterns and code smells

- `script.js` is too large and mixes DOM wiring, state management, storage, rendering, network transport, provider logic, tool execution, and import/export into one file. This increases regression risk and makes isolated testing very hard: [script.js](./script.js:1), [script.js](./script.js:1102).
- The repo contains a partial rewrite that duplicates major responsibilities already present in `script.js`. This creates maintenance drift and makes it unclear which implementation is authoritative: [script.js](./script.js:1), [js/chat-controller.js](./js/chat-controller.js:1), [js/rendering.js](./js/rendering.js:1), [js/state-storage.js](./js/state-storage.js:1), [js/search-providers.js](./js/search-providers.js:1).
- `PROJECT_OVERVIEW.md` describes a modular structure that is not actually what `index.html` ships. That documentation drift will mislead future contributors: [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md:51), [index.html](./index.html:387).
- The provider settings UI in the shipped app still reads and writes a global `configParams` object for generation parameters, while providers also have per-provider config under `provider-manager.js`. That split is inconsistent and causes configuration ambiguity: [script.js](./script.js:261), [script.js](./script.js:977), [js/provider-manager.js](./js/provider-manager.js:14), [js/provider-manager.js](./js/provider-manager.js:170).
- There is an unused `icons` object in the toast system: [script.js](./script.js:1017). Small, but another sign of low cleanup discipline.

### Security and safety issues at code-quality level

- External URLs are used directly in the shipped runtime for Jina Reader without normalization, stripping credentials, blocking local targets, or confirmation: [script.js](./script.js:452), [script.js](./script.js:464). This is the single biggest quality/safety defect.
- Search and link tools are model-callable with no policy layer beyond tool availability toggles. In the shipped runtime, once enabled, the model can trigger outbound requests automatically: [script.js](./script.js:1153), [script.js](./script.js:1175), [script.js](./script.js:1489).
- Import logic in the shipped runtime trusts the imported chat object shape and size too much. It only checks `data.chats` is an array, then merges directly: [script.js](./script.js:1081), [script.js](./script.js:1087), [script.js](./script.js:1089). The modular state layer adds limits and normalization: [js/state-storage.js](./js/state-storage.js:21), [js/state-storage.js](./js/state-storage.js:166), [js/state-storage.js](./js/state-storage.js:261).

## 2. Architecture

### Strengths in the multi-provider design

- Provider-specific concerns are at least conceptually separated. `provider-manager.js` defines provider metadata and defaults, and `js/providers/*.js` define adapter behavior: [js/provider-manager.js](./js/provider-manager.js:14), [js/providers/ollama.js](./js/providers/ollama.js:50), [js/providers/openai.js](./js/providers/openai.js:81), [js/providers/anthropic.js](./js/providers/anthropic.js:10).
- The adapter direction is correct. `fetchModels`, `chat`, and option metadata are the right abstraction boundary for a multi-provider frontend: [js/providers/_adapter.js](./js/providers/_adapter.js:6).
- `provider-manager.js` normalizes parameter fields per provider type and keeps type-specific defaults centralized. That is a good base for extensibility: [js/provider-manager.js](./js/provider-manager.js:170), [js/provider-manager.js](./js/provider-manager.js:191).
- The modular design also correctly separates rendering, state storage, and network/search responsibilities: [js/rendering.js](./js/rendering.js:1), [js/state-storage.js](./js/state-storage.js:1), [js/search-providers.js](./js/search-providers.js:1).

### Weaknesses in the multi-provider design

- The abstraction is not actually used end-to-end in production. `index.html` loads provider adapters, but still routes the main application through `script.js` instead of the modular controller: [index.html](./index.html:387), [index.html](./index.html:393). That means the architecture exists on paper but not in runtime.
- The repo currently has two conflicting sources of truth for provider behavior:
  - The monolithic implementation contains direct branching for `ollama`, `openai`, and `anthropic`: [script.js](./script.js:1270), [script.js](./script.js:1330), [script.js](./script.js:1419).
  - The modular path expects a uniform `adapter.chat(...)` contract: [js/chat-controller.js](./js/chat-controller.js:690), [js/chat-controller.js](./js/chat-controller.js:700).
- Adapter API consistency is weak. `ollama` and `openai` adapters implement `chat(baseUrl, apiKey, messages, options, callbacks, signal)`, but `anthropic` implements `chat(config)` with a completely different signature: [js/providers/ollama.js](./js/providers/ollama.js:63), [js/providers/openai.js](./js/providers/openai.js:107), [js/providers/anthropic.js](./js/providers/anthropic.js:101). If the modular controller were actually loaded, Anthropic chat would fail immediately.
- The configuration model is confused between global generation config and per-provider config. The shipped runtime sends global `configParams` even when providers store their own typed config: [script.js](./script.js:261), [script.js](./script.js:1282), [script.js](./script.js:1339), [script.js](./script.js:1435), [js/provider-manager.js](./js/provider-manager.js:21).
- Provider status is inferred by calling `fetchModels`, which is slow and semantically wrong for a health check: [script.js](./script.js:303), [script.js](./script.js:312).

### Architectural conclusion

The project is halfway through a valuable refactor but has not completed the cutover. The modular direction is materially better, but because it is not the shipped runtime, the repository pays the complexity cost of both designs while receiving the safety benefits of only one.

## 3. Optimizations

### Performance

- Limit chat history by tokens or character budget rather than only “last 10 messages”. Large attached files plus 10 long messages can still create oversized prompts and slow requests: [script.js](./script.js:1124), [js/chat-controller.js](./js/chat-controller.js:440).
- Add size limits for file attachments in the shipped runtime. Right now any selected file is read fully into memory and appended into prompt context: [script.js](./script.js:439), [script.js](./script.js:445), [script.js](./script.js:1134).
- The shipped UI reparses and sanitizes growing markdown on every animation frame during streaming. For long outputs this is expensive: [script.js](./script.js:1216), [script.js](./script.js:1238). A throttled interval or chunk-based updates would reduce layout work.
- `checkProviderStatus()` fetches the full model list just to show online/offline state: [script.js](./script.js:303), [script.js](./script.js:312). A lighter ping endpoint or cached result would reduce startup latency.
- CDN-loading Tailwind at runtime is heavier than building or vendoring CSS once: [index.html](./index.html:13).

### UX

- The app should warn users explicitly that URLs and search queries may be sent to external services before the first use. The modular rewrite adds confirmation messaging; the shipped app does not: [script.js](./script.js:452), [script.js](./script.js:478), [js/search-providers.js](./js/search-providers.js:82).
- The active context is cleared when loading a chat, despite the data model having a `context` field. That makes “pinned context” not actually persistent per thread in the shipped runtime: [script.js](./script.js:563), [script.js](./script.js:578). The modular runtime also resets context on chat load: [js/chat-controller.js](./js/chat-controller.js:130), [js/chat-controller.js](./js/chat-controller.js:226).
- Provider settings should validate URLs and numeric fields before saving. The modular code validates SearXNG URLs and normalizes provider config; the shipped `script.js` mostly accepts raw strings: [script.js](./script.js:164), [script.js](./script.js:983), [js/search-providers.js](./js/search-providers.js:62), [js/provider-manager.js](./js/provider-manager.js:201).
- Accessibility is incomplete. The modular controller includes modal focus trapping, but the shipped runtime does not use it: [js/chat-controller.js](./js/chat-controller.js:67), [js/chat-controller.js](./js/chat-controller.js:81), [js/chat-controller.js](./js/chat-controller.js:861). Current modals in `index.html` lack `role="dialog"` and `aria-modal="true"` attributes: [index.html](./index.html:308), [index.html](./index.html:333), [index.html](./index.html:347).

### DX

- Finish the migration off `script.js`. That is the highest-leverage developer-experience improvement.
- Add automated tests for:
  - SSE/NDJSON stream parsing
  - import/export normalization
  - tool-call accumulation
  - provider config normalization
  - unsafe URL blocking
- Add one runtime entry point only. Right now future contributors have to read both `script.js` and `js/chat-controller.js` to understand intended behavior.
- Expose a version constant instead of hardcoding `1.4.0` in HTML copy and export payloads: [index.html](./index.html:55), [script.js](./script.js:1060). The modular code expects `APP_VERSION` but `index.html` does not load a file defining it: [js/chat-controller.js](./js/chat-controller.js:60), [js/chat-controller.js](./js/chat-controller.js:999). That is another sign the modular path is incomplete.

## 4. Missing Edge Cases, Error Handling Gaps, Missing Features

### Missing edge-case handling

- No storage quota handling. Large chats, imported data, or long RAG contexts can cause `localStorage.setItem` to throw and potentially leave the UI inconsistent: [script.js](./script.js:599), [script.js](./script.js:991), [js/provider-manager.js](./js/provider-manager.js:113).
- No file type/content validation beyond extension filtering on the input element: [index.html](./index.html:179), [script.js](./script.js:439). Binary or huge files can still be selected in some cases and read as text.
- No cancellation cleanup for partial tool loops in storage. On abort, the UI shows a halted message, but the partially generated assistant message is not persisted consistently: [script.js](./script.js:1557), [js/chat-controller.js](./js/chat-controller.js:770).
- No deduplication or truncation of active context by total size. Multiple large docs can explode prompt size: [script.js](./script.js:526), [script.js](./script.js:1131).
- No safe handling of malformed provider configs in the shipped runtime. A bad `aether_config_params` value can inject `NaN` values into requests: [script.js](./script.js:261), [script.js](./script.js:985).

### Missing features implied by the design

- Per-thread context persistence is missing even though each chat object includes `context`: [script.js](./script.js:563). The README advertises pinned context that stays active, but the implementation resets active context on thread load: [README.md](./README.md:40), [script.js](./script.js:578).
- The “default model” field on providers is not meaningfully applied during model selection in the shipped runtime: [script.js](./script.js:166), [script.js](./script.js:355).
- No explicit model capability metadata. Thinking support is inferred by name matching or adapter helper methods, which is brittle: [script.js](./script.js:244), [script.js](./script.js:378), [js/chat-controller.js](./js/chat-controller.js:149), [js/providers/anthropic.js](./js/providers/anthropic.js:47).
- No retry/backoff logic for transient network failures.
- No progressive import preview or merge strategy beyond duplicate ID filtering in the shipped runtime: [script.js](./script.js:1085).

## 5. Critical Concerns

### 1. External URL exfiltration and private-target forwarding

Severity: Critical

The shipped runtime forwards user or model-supplied URLs directly to `https://r.jina.ai/...` without:

- blocking localhost or RFC1918 targets
- removing credentials
- asking for confirmation

Relevant code:

- Initial automatic link capture from user input: [script.js](./script.js:1107), [script.js](./script.js:1110)
- Direct Jina forwarding: [script.js](./script.js:452), [script.js](./script.js:464)
- Model-triggered tool execution also forwards URLs: [script.js](./script.js:1500), [script.js](./script.js:1507)

Impact:

- A pasted `http://localhost:...` or private-network URL is sent to an external service.
- A model can trigger outbound lookups automatically once tools are enabled.
- If users paste internal URLs, this is a privacy leak at minimum and potentially a serious environment-disclosure issue depending on what Jina can fetch.

Important note:

The repository already contains a safer implementation that blocks private hosts and asks for approval, but it is not active because `index.html` does not load `js/search-providers.js` or `js/chat-controller.js`: [js/search-providers.js](./js/search-providers.js:18), [js/search-providers.js](./js/search-providers.js:46), [js/search-providers.js](./js/search-providers.js:82), [index.html](./index.html:387).

### 2. Plaintext secret storage in `localStorage`

Severity: High

Provider API keys and Jina keys are stored in browser `localStorage`:

- shipped runtime: [script.js](./script.js:256), [script.js](./script.js:994)
- provider config persistence: [js/provider-manager.js](./js/provider-manager.js:113)
- modular config persistence: [js/state-storage.js](./js/state-storage.js:276)

Impact:

- Any XSS, compromised CDN dependency, malicious extension, or shared-browser access can recover those secrets.
- This is partially unavoidable in a backendless app, but it should be treated as a major documented risk, not a normal implementation detail.

Mitigations:

- Prefer session-only key entry mode.
- Add “do not persist API keys” option.
- Consider Web Crypto wrapping only as a limited usability improvement, not a full security solution.

### 3. Supply-chain exposure through unaudited CDNs

Severity: High

The app executes remote scripts and styles directly from public CDNs with no Subresource Integrity:

- Tailwind CDN: [index.html](./index.html:13)
- jQuery: [index.html](./index.html:16)
- Marked: [index.html](./index.html:18)
- DOMPurify: [index.html](./index.html:20)
- Highlight.js: [index.html](./index.html:22), [index.html](./index.html:23)

Impact:

- A compromised dependency or CDN path compromises the whole app, including all local chat history and stored API keys.
- This risk is amplified because secrets are persisted client-side.

### 4. Incomplete refactor creates dormant and active security divergence

Severity: High

The modular rewrite contains important safety fixes:

- URL blocking and confirmation: [js/search-providers.js](./js/search-providers.js:29), [js/search-providers.js](./js/search-providers.js:82)
- import size limits and shape normalization: [js/state-storage.js](./js/state-storage.js:21), [js/state-storage.js](./js/state-storage.js:166)
- message ID-based editing/deletion: [js/chat-controller.js](./js/chat-controller.js:265)

But the shipped runtime still uses the older unsafe code path:

- [index.html](./index.html:387) through [index.html](./index.html:393)

This is a showstopper from a maintenance perspective because contributors can easily believe the safer code is already live when it is not.

## Recommended Priority Order

1. Make the safer modular runtime the actual runtime, or port its security fixes into `script.js` immediately.
2. Block private/local URLs and require explicit confirmation before any external link/search request.
3. Remove or reduce `localStorage` secret persistence.
4. Replace runtime CDN dependencies with vendored assets or at least add integrity and tighter provenance controls where possible.
5. Finish provider abstraction cleanup so every adapter implements the same contract.
6. Add import/file/context limits to the shipped path.
7. Add tests around stream parsing and tool execution.

## Bottom Line

The project has a promising architecture in progress, but the currently shipped app is still the older implementation. That older path has the main showstopper issues: unsafe outbound URL forwarding, weak storage hardening, incomplete provider protocol handling, and a large maintenance split between “intended design” and “actual runtime.” The repo is close to a better state than production behavior suggests, but only if the modular rewrite is completed and made authoritative.
