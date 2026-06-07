$(document).ready(function () {
  // --- Elements ---
  const $chatArea = $("#chat-area");
  const $chatForm = $("#chat-form");
  const $userInput = $("#user-input");
  const $themeToggle = $("#theme-toggle");
  const $modelSelect = $("#model-select");
  const $thinkConfig = $("#thinking-config");
  const $thinkToggle = $("#think-toggle");
  const $thinkLevel = $("#think-level");
  const $sendBtn = $("#send-btn");
  const $stopBtn = $("#stop-btn");
  const $chatList = $("#chat-list");
  const $newChatBtn = $("#new-chat-btn");
  const $sidebar = $("#sidebar");
  const $openSidebar = $("#open-sidebar");
  const $closeSidebar = $("#close-sidebar");
  const $currentChatTitle = $("#current-chat-title");
  const $welcomeScreen = $("#welcome-screen");
  const $fileUpload = $("#file-upload");
  const $attachBtn = $("#attach-btn");
  const $contextPreview = $("#context-preview");

  // New Elements
  const $settingsBtn = $("#settings-btn");
  const $settingsModal = $("#settings-modal");
  const $closeSettings = $("#close-settings");
  const $saveSettings = $("#save-settings");
  const $tempInput = $("#temp-input");
  const $ctxInput = $("#ctx-input");
  const $topPInput = $("#top-p-input");
  const $topKInput = $("#top-k-input");
  const $showMetricsToggle = $("#show-metrics-toggle");
  const $toolsEnabledToggle = $("#tools-enabled-toggle");
  const $webSearchToggle = $("#web-search-toggle");
  const $jinaApiKeyInput = $("#jina-api-key");
  const $providerJina = $("#provider-jina");
  const $providerSearxng = $("#provider-searxng");
  const $searxngUrlInput = $("#searxng-url");
  const $exportBtn = $("#export-chat-btn");
  const $importBtn = $("#import-chat-btn");
  const $importFileInput = $("#import-file-input");
  const $sysPromptModal = $("#system-prompt-modal");
  const $sysPromptInput = $("#system-prompt-input");
  const $saveSysPrompt = $("#save-system-prompt");
  const $closeSysPrompt = $("#close-system-prompt");

  const OLLAMA_BASE_URL = "http://localhost:11434";

  // --- State ---
  let chats = JSON.parse(localStorage.getItem("ollama_chats")) || [];
  let currentChatId = localStorage.getItem("ollama_current_chat_id") || null;
  let activeContext = []; // Stores objects like { type: 'file'|'link', name: string, content: string }
  let currentAbortController = null;
  let thinkModels = [
    "qwen3",
    "qwen3.5",
    "deepseek-r1",
    "deepseek-v3.1",
    "gpt-oss",
  ];

  // Config State
  let showMetrics = localStorage.getItem("ollama_show_metrics") === "true";
  let toolsEnabled = localStorage.getItem("ollama_tools_enabled") !== "false"; // Default to true
  let webSearchEnabled = localStorage.getItem("ollama_web_search") === "true";
  let jinaApiKey = localStorage.getItem("ollama_jina_key") || "";
  let searchProvider = localStorage.getItem("ollama_search_provider") || "jina";
  let searxngUrl = localStorage.getItem("ollama_searxng_url") || "http://172.17.0.1:8080";
  let customSystemPrompt = localStorage.getItem("ollama_system_prompt") || "You are a professional AI assistant. Don't use emoji. Aim for clarity and depth. If a document is provided, use it as your primary source.";

  let configParams = JSON.parse(localStorage.getItem("ollama_config_params")) || {
    temperature: 0.7,
    num_ctx: 16384,
    top_p: 0.9,
    top_k: 40
  };

  // --- Initialization ---
  init();

  function init() {
    renderChatList();
    if (currentChatId) {
      loadChat(currentChatId);
    }
    fetchModels();
    checkTheme();
    configureMarked();
    loadConfigToInputs();
  }

  function configureMarked() {
    marked.setOptions({
      breaks: true,
      gfm: true,
    });
  }

  // --- Model Fetching ---
  async function fetchModels() {
    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
      const data = await response.json();

      const prevVal = $modelSelect.val();
      $modelSelect.empty();
      if (data.models && data.models.length > 0) {
        data.models.forEach((model) => {
          const name = model.name;
          $modelSelect.append(`<option value="${name}">${name}</option>`);
        });
        if (prevVal) $modelSelect.val(prevVal);
      } else {
        $modelSelect.append('<option value="">No Models</option>');
      }
      updateThinkUIVisibility();
    } catch (error) {
      $modelSelect.empty().append('<option value="">Offline</option>');
    }
  }

  function updateThinkUIVisibility() {
    const model = $modelSelect.val() || "";
    const isThinkModel = thinkModels.some((m) =>
      model.toLowerCase().includes(m),
    );
    if (isThinkModel) $thinkConfig.removeClass("hidden").addClass("flex");
    else $thinkConfig.addClass("hidden").removeClass("flex");
  }

  $modelSelect.on("change", updateThinkUIVisibility);

  // --- Context Managers (RAG & Link Analysis) ---
  $attachBtn.on("click", () => $fileUpload.click());

  $fileUpload.on("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
      const content = e.target.result;
      addContext("file", file.name, content);
    };
    reader.readAsText(file);
    $fileUpload.val(""); // Reset
  });

  async function processLink(url) {
    const jinaUrl = `https://r.jina.ai/${url}`;
    try {
      const response = await fetch(jinaUrl);
      const content = await response.text();
      addContext("link", url, content);
    } catch (error) {
      console.error("Link analysis failed:", error);
      showToast("Could not analyze the link. Make sure it's valid.", "error");
    }
  }

  async function fetchLinkContent(url) {
    const jinaUrl = `https://r.jina.ai/${url}`;
    try {
      const response = await fetch(jinaUrl, {
        headers: { "X-No-Cache": "true" }
      });
      if (!response.ok) throw new Error("Failed to fetch link content");
      return await response.text();
    } catch (error) {
      console.error("Link analysis failed:", error);
      return `Error: Could not analyze the link ${url}.`;
    }
  }

  async function fetchWebSearchContent(query) {
    const jinaSearchUrl = `https://s.jina.ai/?q=${encodeURIComponent(query)}`;
    const headers = {
      "X-Respond-With": "no-content"
    };
    if (jinaApiKey) {
      headers["Authorization"] = `Bearer ${jinaApiKey}`;
    }

    try {
      const response = await fetch(jinaSearchUrl, { headers });
      if (!response.ok) throw new Error("Web search failed");
      return await response.text();
    } catch (error) {
      console.error("Web search failed:", error);
      return `Error: Web search for "${query}" failed.`;
    }
  }

  async function fetchSearxngContent(query) {
    const url = searxngUrl.replace(/\/+$/, "") + "/search";
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "q=" + encodeURIComponent(query) + "&format=json&language=en&categories=general"
      });
      if (!response.ok) throw new Error("SearXNG search failed: " + response.status);
      const data = await response.json();
      let result = "";
      if (data.answers && data.answers.length > 0) {
        result += "Answers:\n" + data.answers.join("\n") + "\n\n";
      }
      if (data.results && data.results.length > 0) {
        data.results.forEach(function(r, i) {
          result += "[" + (i+1) + "] Title: " + (r.title || "Untitled") + "\n";
          result += "   URL Source: " + (r.url || "") + "\n";
          result += "   Description: " + (r.content || "") + "\n\n";
        });
      }
      if (!result.trim()) result = "No results found for: " + query;
      return result;
    } catch (error) {
      console.error("SearXNG search failed:", error);
      return "Error: SearXNG search for \"" + query + "\" failed. Make sure SearXNG is running at " + searxngUrl;
    }
  }

  function addContext(type, name, content) {
    if (activeContext.some((c) => c.name === name)) return;
    activeContext.push({ type, name, content });
    renderContextChips();
  }

  function removeContext(index) {
    activeContext.splice(index, 1);
    renderContextChips();
  }

  function renderContextChips() {
    $contextPreview.empty();
    activeContext.forEach((context, index) => {
      const chipHtml = `
                <div class="flex items-center gap-2 px-3 py-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full text-[0.65rem] font-bold border border-zinc-300 dark:border-zinc-700 animate-in fade-in zoom-in">
                    <span class="opacity-50">${context.type === "file" ? "📄" : "🔗"}</span>
                    <span class="truncate max-w-[120px]">${context.name}</span>
                    <button class="remove-ctx hover:text-red-500 transition-colors ml-1" data-index="${index}">×</button>
                </div>
            `;
      $contextPreview.append(chipHtml);
    });
  }

  $contextPreview.on("click", ".remove-ctx", function () {
    removeContext($(this).data("index"));
  });

  // --- Chat Management ---
  function createNewChat() {
    const id = "chat-" + Date.now();
    const newChat = {
      id: id,
      title: "Untitled",
      messages: [],
      timestamp: Date.now(),
      context: [], 
    };
    chats.unshift(newChat);
    saveChats();
    activeContext = [];
    renderContextChips();
    renderChatList();
    loadChat(id);
  }

  function loadChat(id) {
    currentChatId = id;
    localStorage.setItem("ollama_current_chat_id", id);
    const chat = chats.find((c) => c.id === id);
    if (!chat) return;
    activeContext = [];
    renderContextChips();
    $currentChatTitle.text(chat.title);
    $chatArea.find(".message-bubble").remove();
    if (chat.messages.length === 0) {
      $welcomeScreen.show();
    } else {
      $welcomeScreen.hide();
      chat.messages.forEach((msg) => {
        appendMessageUI(msg.text, msg.isUser, false, msg.metrics, msg.webReferences);
      });
    }
    $(".chat-item").removeClass("active");
    $(`.chat-item[data-id="${id}"]`).addClass("active");
    $chatArea.scrollTop($chatArea[0].scrollHeight);
  }

  function saveChats() {
    localStorage.setItem("ollama_chats", JSON.stringify(chats));
  }

  function renderChatList() {
    $chatList.empty();
    chats.forEach((chat) => {
      const activeClass = chat.id === currentChatId ? "active" : "";
      const chatItem = `
                <div class="chat-item ${activeClass}" data-id="${chat.id}">
                    <span class="chat-title-text">${chat.title}</span>
                    <div class="chat-item-actions">
                        <button class="chat-action-btn rename-item" title="Rename" data-id="${chat.id}">✎</button>
                        <button class="chat-action-btn delete-item" title="Delete" data-id="${chat.id}">×</button>
                    </div>
                </div>
            `;
      $chatList.append(chatItem);
    });
  }

  function deleteChat(id) {
    if (confirm("Delete this thread permanently?")) {
      chats = chats.filter((c) => c.id !== id);
      saveChats();
      if (currentChatId === id) {
        if (chats.length > 0) loadChat(chats[0].id);
        else createNewChat();
      }
      renderChatList();
    }
  }

  function renameChat(id) {
    const chat = chats.find((c) => c.id === id);
    const newTitle = prompt("New Thread Name:", chat.title);
    if (newTitle && newTitle.trim()) {
      chat.title = newTitle.trim();
      saveChats();
      renderChatList();
      if (currentChatId === id) $currentChatTitle.text(chat.title);
    }
  }

  $chatList.on("click", ".delete-item", function (e) {
    e.stopPropagation();
    deleteChat($(this).data("id"));
  });

  $chatList.on("click", ".rename-item", function (e) {
    e.stopPropagation();
    renameChat($(this).data("id"));
  });

  function appendMessageUI(text, isUser = false, isHtml = false, metrics = null, webReferences = null) {
    const id = "msg-" + Date.now() + Math.random().toString(36).substr(2, 9);
    let content = "";
    if (isUser) {
      content = text;
    } else if (isHtml) {
      content = text;
    } else {
      const result = formatThinkResponse(text);
      content = typeof result === "string" ? result : result.html;
    }

    const messageHtml = `
            <div id="${id}" class="message-bubble w-full ${isUser ? "user-msg" : "bot-msg"}">
                <div class="content-box">
                    <div class="prose-custom max-w-none">${content}</div>
                    <div class="status-indicator-zone"></div>
                    <div class="references-zone"></div>
                    <div class="metrics-zone"></div>
                    <div class="msg-actions flex gap-2 mt-2 opacity-0 msg-actions-visible transition-opacity">
                        <button class="edit-msg text-[0.55rem] font-bold uppercase tracking-widest text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors px-2 py-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800" data-msg-id="${id}">Edit</button>
                        <button class="delete-msg text-[0.55rem] font-bold uppercase tracking-widest text-zinc-400 hover:text-red-500 transition-colors px-2 py-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800" data-msg-id="${id}">Delete</button>
                    </div>
                </div>
                ${!isUser ? "" : `<div class="mt-2 text-[10px] text-zinc-400 font-bold uppercase tracking-widest px-1 opacity-60 italic">Personal Transmission</div>`}
            </div>
        `;

    $chatArea.append(messageHtml);
    const $newMsg = $(`#${id}`);
    if (!isUser) {
      const $container = $newMsg.find(".prose-custom");
      processMessageContent($container);
      if (metrics) {
        renderMetricsUI($newMsg.find(".metrics-zone"), metrics);
      }
      if (webReferences && webReferences.length > 0) {
        renderReferencesUI($newMsg.find(".references-zone"), webReferences);
      }
    }
    $chatArea.scrollTop($chatArea[0].scrollHeight);
    return id;
  }

  function renderReferencesUI($container, webRefs) {
    const refsHtml = `
      <div class="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/50">
        <div class="flex items-center gap-2 mb-2">
            <span class="text-[0.55rem] font-black uppercase tracking-widest text-zinc-400">Web References</span>
        </div>
        <div class="flex flex-wrap gap-2">
            ${webRefs.map((ref, idx) => `
                <div class="flex items-center gap-2 px-2 py-1 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-md text-[0.6rem] font-bold text-zinc-500">
                    <span class="opacity-50">🔍</span>
                    <span>${ref.query || ref}</span>
                    <button class="view-ref-details ml-1 opacity-40 hover:opacity-100 transition-opacity" data-index="${idx}">
                        <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M19 9l-7 7-7-7" /></svg>
                    </button>
                </div>
            `).join('')}
        </div>
      </div>
    `;
    $container.html(refsHtml);
    
    $container.find('.view-ref-details').on('click', function() {
        const idx = $(this).data('index');
        const ref = webRefs[idx];
        if (ref && ref.results) {
            showReferenceModal(ref.query, ref.results);
        }
    });
  }

  function showReferenceModal(query, results) {
    const $modal = $("#reference-modal");
    const $title = $("#ref-modal-title");
    const $content = $("#ref-modal-content");

    $title.text(`Search Results: ${query}`);
    $content.empty();

    if (results.length === 0) {
        $content.append('<p class="text-xs text-zinc-500">No results found or parsing failed.</p>');
    } else {
        results.forEach(res => {
            const itemHtml = `
                <div class="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-1">
                    <a href="${res.url}" target="_blank" class="text-xs font-black text-zinc-900 dark:text-zinc-100 hover:underline flex items-center gap-2">
                        ${res.title}
                        <svg class="w-3 h-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    </a>
                    <span class="block text-[0.6rem] text-zinc-400 truncate">${res.url}</span>
                    <p class="text-[0.65rem] leading-relaxed text-zinc-500 line-clamp-2">${res.description}</p>
                </div>
            `;
            $content.append(itemHtml);
        });
    }

    $modal.removeClass("hidden").addClass("flex");
  }

  function renderMetricsUI($container, metrics) {
    if (!showMetrics || !metrics || !metrics.total_duration) return;
    
    const totalSec = (metrics.total_duration / 1e9).toFixed(2);
    const loadSec = (metrics.load_duration / 1e9).toFixed(2);
    const promptEvalSec = (metrics.prompt_eval_duration / 1e9).toFixed(2);
    const evalSec = (metrics.eval_duration / 1e9).toFixed(2);
    const tps = (metrics.eval_count / (metrics.eval_duration / 1e9)).toFixed(1);

    const metricsHtml = `
      <div class="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800/50 flex flex-wrap gap-y-2 gap-x-6 items-center animate-in fade-in slide-in-from-top-2 duration-500">
        <div class="flex items-center gap-2">
          <span class="text-[0.55rem] font-black uppercase tracking-widest text-zinc-400">Speed</span>
          <span class="text-[0.65rem] font-bold text-zinc-900 dark:text-zinc-100">${tps} tokens/s</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-[0.55rem] font-black uppercase tracking-widest text-zinc-400">Tokens</span>
          <span class="text-[0.6rem] font-medium text-zinc-500 dark:text-zinc-400">
            <b class="text-zinc-700 dark:text-zinc-200">${metrics.prompt_eval_count}</b> in / 
            <b class="text-zinc-700 dark:text-zinc-200">${metrics.eval_count}</b> out
          </span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-[0.55rem] font-black uppercase tracking-widest text-zinc-400">Duration</span>
          <span class="text-[0.6rem] font-medium text-zinc-500 dark:text-zinc-400" title="Load: ${loadSec}s | Prompt: ${promptEvalSec}s | Eval: ${evalSec}s">
            Total <b class="text-zinc-700 dark:text-zinc-200">${totalSec}s</b>
          </span>
        </div>
      </div>
    `;
    $container.html(metricsHtml);
  }

  function safeMarkedParse(text, isStreaming = false) {
    if (!isStreaming)
      return { html: marked.parse(text), isGeneratingCode: false };
    const parts = text.split("```");
    if (parts.length % 2 === 0) {
      const lastPart = parts[parts.length - 1];
      const langMatch = lastPart.match(/^([a-zA-Z0-9#+.-]*)/);
      const language =
        langMatch && langMatch[1] ? langMatch[1].toUpperCase() : "CODE";
      const readyToRender = parts.slice(0, -1).join("```");
      return {
        html: marked.parse(readyToRender),
        isGeneratingCode: true,
        language: language,
      };
    }
    return { html: marked.parse(text), isGeneratingCode: false };
  }

  function formatThinkResponse(text, nativeThinking = "", isStreaming = false) {
    const parse = (t) => safeMarkedParse(t, isStreaming);
    let isGeneratingCode = false;
    let codeLanguage = "";
    const processPart = (t) => {
      const result = parse(t);
      if (result.isGeneratingCode) {
        isGeneratingCode = true;
        codeLanguage = result.language;
      }
      return result.html;
    };
    if (!text.includes("<think>") && !nativeThinking) {
      const res = parse(text);
      return isStreaming ? res : res.html;
    }
    let html = "";
    if (nativeThinking) {
      html += `
            <div class="thought-block is-thinking">
                <div class="thought-header">
                    <div class="thinking-dot-mini"></div>
                    <span>Thinking...</span>
                </div>
                <div class="thought-content">${processPart(nativeThinking)}</div>
            </div>
        `;
    }
    let currentPos = 0;
    const thinkRegex = /<think>([\s\S]*?)(?:<\/think>|$)/g;
    let match;
    while ((match = thinkRegex.exec(text)) !== null) {
      const before = text.substring(currentPos, match.index);
      if (before.trim()) html += processPart(before);
      const thoughtContent = match[1];
      const isUnclosed = !match[0].endsWith("</think>");
      html += `
                <div class="thought-block ${isUnclosed ? "is-thinking" : ""}">
                    <div class="thought-header">
                        ${isUnclosed ? '<div class="thinking-dot-mini"></div>' : '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>'}
                        <span>${isUnclosed ? "Thinking..." : "Thought Process"}</span>
                    </div>
                    <div class="thought-content">${processPart(thoughtContent)}</div>
                </div>
            `;
      currentPos = thinkRegex.lastIndex;
    }
    const after = text.substring(currentPos);
    if (after.trim()) html += processPart(after);
    if (isStreaming) {
      return { html, isGeneratingCode, language: codeLanguage };
    }
    return html;
  }

  function processMessageContent($container) {
    $container.find("pre code").each(function () {
      if (!$(this).data("highlighted")) {
        hljs.highlightElement(this);
        $(this).data("highlighted", "true");
        const $pre = $(this).parent("pre");
        if ($pre.find(".copy-btn").length === 0) {
          $pre.append('<button class="copy-btn">COPY</button>');
        }
      }
    });
  }

  $chatArea.on("click", ".copy-btn", function () {
    const $btn = $(this);
    const $code = $btn.siblings("code");
    const text = $code.text();
    navigator.clipboard.writeText(text).then(() => {
      $btn.text("COPIED!").addClass("copied");
      setTimeout(() => {
        $btn.text("COPY").removeClass("copied");
      }, 2000);
    });
  });

  // --- Message Edit / Delete ---
  $chatArea.on("click", ".delete-msg", function () {
    const msgId = $(this).data("msg-id");
    if (!currentChatId) return;
    const chat = chats.find(function(c) { return c.id === currentChatId; });
    if (!chat) return;
    // Find the message element index
    const $bubble = $("#" + msgId);
    const index = $bubble.index() - 1; // Account for welcome screen
    // Actually, find by iterating
    let msgIndex = -1;
    $bubble.siblings(".message-bubble").each(function(i) {
      if ($(this).attr("id") === msgId) msgIndex = i;
    });
    if (msgIndex < 0) {
      // Find by position: it's the first matching element
      const allBubbles = $chatArea.find(".message-bubble");
      allBubbles.each(function(i) {
        if ($(this).attr("id") === msgId) msgIndex = i;
      });
    }
    if (msgIndex >= 0 && msgIndex < chat.messages.length) {
      chat.messages.splice(msgIndex, 1);
      saveChats();
      $bubble.remove();
      showToast("Message deleted", "info");
      if (chat.messages.length === 0) $welcomeScreen.show();
    }
  });

  $chatArea.on("click", ".edit-msg", function () {
    const msgId = $(this).data("msg-id");
    if (!currentChatId) return;
    const chat = chats.find(function(c) { return c.id === currentChatId; });
    if (!chat) return;
    // Find message index
    let msgIndex = -1;
    const allBubbles = $chatArea.find(".message-bubble");
    allBubbles.each(function(i) {
      if ($(this).attr("id") === msgId) msgIndex = i;
    });
    if (msgIndex < 0 || msgIndex >= chat.messages.length) return;
    const msg = chat.messages[msgIndex];
    if (!msg.isUser) {
      showToast("Only user messages can be edited", "warning");
      return;
    }
    // Put the message text in the input field for editing
    $userInput.val(msg.text).trigger("input").focus();
    // Remove the old message
    chat.messages.splice(msgIndex, 1);
    saveChats();
    $("#" + msgId).remove();
    showToast("Edit your message and send", "info");
  });

  // --- Theme Control ---
  $themeToggle.on("click", function () {
    $("html").toggleClass("dark");
    const isDark = $("html").hasClass("dark");
    localStorage.setItem("theme", isDark ? "dark" : "light");
  });

  function checkTheme() {
    const theme = localStorage.getItem("theme");
    const isDark =
      theme === "dark" ||
      (!theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (isDark) $("html").addClass("dark");
  }

  function loadConfigToInputs() {
    $tempInput.val(configParams.temperature);
    $ctxInput.val(configParams.num_ctx);
    $topPInput.val(configParams.top_p);
    $topKInput.val(configParams.top_k);
    $showMetricsToggle.prop("checked", showMetrics);
    $toolsEnabledToggle.prop("checked", toolsEnabled);
    $webSearchToggle.prop("checked", webSearchEnabled);
    $jinaApiKeyInput.val(jinaApiKey);
    if (searchProvider === "jina") $providerJina.prop("checked", true);
    else $providerSearxng.prop("checked", true);
    $searxngUrlInput.val(searxngUrl);
    $sysPromptInput.val(customSystemPrompt);
  }

  // --- UI Event Handlers ---
  $settingsBtn.on("click", () => $settingsModal.removeClass("hidden").addClass("flex"));
  $closeSettings.on("click", () => $settingsModal.addClass("hidden").removeClass("flex"));

  $saveSettings.on("click", () => {
    showMetrics = $showMetricsToggle.is(":checked");
    toolsEnabled = $toolsEnabledToggle.is(":checked");
    webSearchEnabled = $webSearchToggle.is(":checked");
    jinaApiKey = $jinaApiKeyInput.val().trim();
    searchProvider = $providerSearxng.is(":checked") ? "searxng" : "jina";
    searxngUrl = $searxngUrlInput.val().trim() || "http://172.17.0.1:8080";

    configParams = {
      temperature: parseFloat($tempInput.val()),
      num_ctx: parseInt($ctxInput.val()),
      top_p: parseFloat($topPInput.val()),
      top_k: parseInt($topKInput.val())
    };
    localStorage.setItem("ollama_show_metrics", showMetrics);
    localStorage.setItem("ollama_tools_enabled", toolsEnabled);
    localStorage.setItem("ollama_web_search", webSearchEnabled);
    localStorage.setItem("ollama_jina_key", jinaApiKey);
    localStorage.setItem("ollama_search_provider", searchProvider);
    localStorage.setItem("ollama_searxng_url", searxngUrl);
    localStorage.setItem("ollama_config_params", JSON.stringify(configParams));
    if (currentChatId) loadChat(currentChatId);
    $settingsModal.addClass("hidden").removeClass("flex");
  });

  $settingsModal.on("click", function(e) {
    if (e.target === this) $(this).addClass("hidden").removeClass("flex");
  });

  const $refModal = $("#reference-modal");
  const $closeRefModal = $("#close-reference-modal");

  $closeRefModal.on("click", () => $refModal.addClass("hidden").removeClass("flex"));
  $refModal.on("click", function(e) {
    if (e.target === this) $(this).addClass("hidden").removeClass("flex");
  });

  // --- Toast System ---
  function showToast(message, type) {
    type = type || "info";
    var icons = { info: "", success: "", error: "", warning: "" };
    var colors = {
      info: "border-l-zinc-500 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300",
      success: "border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300",
      error: "border-l-red-500 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300",
      warning: "border-l-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300"
    };
    var toast = document.createElement("div");
    toast.className = "toast pointer-events-auto animate-in slide-in-from-right-4 fade-in duration-300 fill-mode-forwards border-l-4 rounded-lg px-4 py-3 text-xs font-bold shadow-lg " + (colors[type] || colors.info);
    toast.textContent = message;
    var container = document.getElementById("toast-container");
    container.appendChild(toast);
    setTimeout(function() { toast.classList.add("opacity-0", "transition-opacity", "duration-300"); setTimeout(function() { toast.remove(); }, 300); }, 3500);
  }

  // --- System Prompt Modal ---
  $settingsBtn.on("click", function() {
    $sysPromptInput.val(customSystemPrompt);
    // Already handled below for settings modal
  });

  $closeSysPrompt.on("click", function() {
    $sysPromptModal.addClass("hidden").removeClass("flex");
  });

  $sysPromptModal.on("click", function(e) {
    if (e.target === this) $(this).addClass("hidden").removeClass("flex");
  });

  // Long-press on header to edit system prompt
  $currentChatTitle.parent().parent().on("dblclick", function() {
    $sysPromptInput.val(customSystemPrompt);
    $sysPromptModal.removeClass("hidden").addClass("flex");
  });

  $saveSysPrompt.on("click", function() {
    var newPrompt = $sysPromptInput.val().trim();
    if (newPrompt) {
      customSystemPrompt = newPrompt;
      localStorage.setItem("ollama_system_prompt", customSystemPrompt);
      showToast("System prompt updated", "success");
    }
    $sysPromptModal.addClass("hidden").removeClass("flex");
  });

  // --- Export / Import ---
  $exportBtn.on("click", function() {
    if (chats.length === 0) { showToast("No chats to export", "warning"); return; }
    var exportData = JSON.stringify({ version: "1.4.0", exportedAt: new Date().toISOString(), chats: chats }, null, 2);
    var blob = new Blob([exportData], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "ollama-chats-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Exported " + chats.length + " chat(s)", "success");
  });

  $importBtn.on("click", function() {
    $importFileInput.click();
  });

  $importFileInput.on("change", function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var data = JSON.parse(e.target.result);
        if (!data.chats || !Array.isArray(data.chats)) throw new Error("Invalid format");
        // Merge: add imported chats, avoid duplicates by id
        var existingIds = new Set(chats.map(function(c) { return c.id; }));
        var imported = data.chats.filter(function(c) { return !existingIds.has(c.id); });
        if (imported.length === 0) { showToast("All chats already exist", "warning"); return; }
        chats = imported.concat(chats);
        saveChats();
        renderChatList();
        showToast("Imported " + imported.length + " chat(s)", "success");
      } catch (err) {
        showToast("Import failed: " + err.message, "error");
      }
    };
    reader.readAsText(file);
    $importFileInput.val("");
  });

  // --- Main Logics ---
  $chatForm.on("submit", async function (e) {
    e.preventDefault();
    const rawMessage = $userInput.val().trim();
    const selectedModel = $modelSelect.val();
    if (!rawMessage || !selectedModel) return;
    const urlMatch = rawMessage.match(/https?:\/\/[^\s]+/);
    if (urlMatch && activeContext.length === 0) {
      const url = urlMatch[0];
      await processLink(url);
    }
    if (!currentChatId) createNewChat();
    const chat = chats.find((c) => c.id === currentChatId);
    $welcomeScreen.hide();
    appendMessageUI(rawMessage, true);
    $userInput.val("").css("height", "auto");
    let thinkValue = false;
    if ($thinkToggle.is(":checked")) {
      const level = $thinkLevel.val();
      thinkValue = level === "true" ? true : level;
    }
    const messages = [];
    messages.push({ role: "system", content: customSystemPrompt });
    const historyLimit = 10;
    const recentHistory = chat.messages.slice(-historyLimit);
    recentHistory.forEach((m) => {
      messages.push({ role: m.isUser ? "user" : "assistant", content: m.text });
    });
    let userMessageWithContext = "";
    let hasContext = false;
    if (activeContext.length > 0) {
      hasContext = true;
      userMessageWithContext += "### PRIMARY KNOWLEDGE SOURCE (PINNED):\n";
      activeContext.forEach((ctx) => {
        userMessageWithContext += `DOCUMENT [${ctx.name}]: ${ctx.content}\n\n`;
      });
    }
    if (hasContext) {
        userMessageWithContext += "### INSTRUCTION:\nBased on the provided documents, answer the following question. If the information isn't present, use your general knowledge but clearly state so.\n\n";
    }
    userMessageWithContext += `### USER QUESTION:\n${rawMessage}`;
    messages.push({ role: "user", content: userMessageWithContext });
    chat.messages.push({ text: rawMessage, isUser: true });
    if (chat.title === "Untitled") {
      chat.title = rawMessage.substring(0, 30);
      $currentChatTitle.text(chat.title);
      renderChatList();
    }
    saveChats();
    $userInput.prop("disabled", true);
    $sendBtn.prop("disabled", true).addClass("opacity-50");

    let baseTools = undefined;
    if (toolsEnabled) {
      baseTools = [
        {
          type: "function",
          function: {
            name: "process_link",
            description: "Fetch and process content from a URL to get its information",
            parameters: {
              type: "object",
              properties: {
                url: {
                  type: "string",
                  description: "The URL to fetch content from"
                }
              },
              required: ["url"]
            }
          }
        }
      ];

      if (webSearchEnabled) {
        baseTools.push({
          type: "function",
          function: {
            name: "web_search",
            description: "Search the web to find up-to-date information on a specific topic",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The search query to look for"
                }
              },
              required: ["query"]
            }
          }
        });
      }
    }

    const botMsgId = appendMessageUI(
      '<div class="thinking-container"><div class="dot dot-1"></div><div class="dot dot-2"></div><div class="dot dot-3"></div></div>',
      false,
      true,
    );
    const $botMsgContainer = $(`#${botMsgId} .prose-custom`);
    let fullResponse = "";
    let localNativeThinking = "";
    let finalMetrics = null;
    let webReferences = []; 

    $sendBtn.hide();
    $stopBtn.removeClass("hidden").show();
    currentAbortController = new AbortController();
    let animationFrameId = null;
    
    try {
      let displayedResponse = "";
      let displayedThinking = "";

      const smoothUpdate = () => {
        let hasNewContent = false;
        const threshold = 50;
        const isAtBottom = $chatArea[0].scrollHeight - $chatArea.scrollTop() - $chatArea.outerHeight() < threshold;
        if (displayedThinking.length < localNativeThinking.length) {
          const syncSpeed = Math.ceil((localNativeThinking.length - displayedThinking.length) / 5);
          displayedThinking += localNativeThinking.substring(
            displayedThinking.length,
            displayedThinking.length + syncSpeed,
          );
          hasNewContent = true;
        }
        if (displayedResponse.length < fullResponse.length) {
          const diff = fullResponse.length - displayedResponse.length;
          const syncSpeed = Math.ceil(diff / 4);
          displayedResponse += fullResponse.substring(
            displayedResponse.length,
            displayedResponse.length + syncSpeed,
          );
          hasNewContent = true;
        }
        if (hasNewContent) {
          const result = formatThinkResponse(displayedResponse, displayedThinking, true);
          $botMsgContainer.html(result.html);
          const $indicatorZone = $botMsgContainer.siblings(".status-indicator-zone");
          if (result.isGeneratingCode) {
            if ($indicatorZone.children().length === 0) {
              $indicatorZone.html(
                `<div class="code-generating-indicator"><div class="spinner"></div><span>Generating ${result.language}...</span><div class="cursor"></div></div>`,
              );
            } else {
              $indicatorZone.find("span").text(`Generating ${result.language}...`);
            }
          } else {
            $indicatorZone.empty();
          }
          if (isAtBottom) {
            $chatArea.scrollTop($chatArea[0].scrollHeight);
          }
        }
        animationFrameId = requestAnimationFrame(smoothUpdate);
      };
      
      animationFrameId = requestAnimationFrame(smoothUpdate);

      let isLooping = true;
      while (isLooping) {
        let toolCallsInPass = [];
        const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: currentAbortController.signal,
          body: JSON.stringify({
            model: selectedModel,
            messages: messages,
            tools: baseTools ? JSON.parse(JSON.stringify(baseTools)) : undefined,
            think: thinkValue,
            stream: true,
            options: {
              temperature: configParams.temperature,
              num_ctx: configParams.num_ctx,
              top_p: configParams.top_p,
              top_k: configParams.top_k
            }
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP Error ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const json = JSON.parse(line);
              if (json.message) {
                if (json.message.content) {
                  fullResponse += json.message.content;
                }
                if (json.message.thinking) {
                  localNativeThinking += json.message.thinking;
                }
                if (json.message.tool_calls) {
                  toolCallsInPass.push(...json.message.tool_calls);
                }
              }
              if (json.thinking) {
                localNativeThinking += json.thinking;
              }
              if (json.done) {
                chat.context = json.context;
                if (json.total_duration) {
                  finalMetrics = {
                    total_duration: json.total_duration,
                    load_duration: json.load_duration,
                    prompt_eval_duration: json.prompt_eval_duration,
                    eval_duration: json.eval_duration,
                    eval_count: json.eval_count,
                    prompt_eval_count: json.prompt_eval_count
                  };
                }
              }
            } catch (e) {}
          }
        }

        if (toolCallsInPass.length > 0) {
          // Assistant message with tool calls
          messages.push({
            role: "assistant",
            content: fullResponse,
            tool_calls: toolCallsInPass
          });

          // Execute tools
          for (const tc of toolCallsInPass) {
            const $indicatorZone = $botMsgContainer.siblings(".status-indicator-zone");
            if (tc.function.name === "process_link") {
              const url = tc.function.arguments.url;
              // UI indication
              $indicatorZone.html(
                `<div class="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400 py-2"><div class="spinner-mini"></div><span>Executing tool: process_link(${url})</span></div>`
              );

              const content = await fetchLinkContent(url);
              messages.push({
                role: "tool",
                content: content
              });
              // Also add to visual context chips for user feedback
              addContext("link", url, content);
            } else if (tc.function.name === "web_search") {
                                const query = tc.function.arguments.query;
                                const providerLabel = searchProvider === "searxng" ? "SearXNG" : "Jina AI";
                                $indicatorZone.html(
                                    `<div class="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400 py-2"><div class="spinner-mini"></div><span>Executing tool: web_search("${query}") via ${providerLabel}</span></div>`
                                );
                                const content = searchProvider === "searxng" ? await fetchSearxngContent(query) : await fetchWebSearchContent(query);
                                const parsedResults = searchProvider === "searxng" ? parseSearxngResults(content) : parseJinaSearchResults(content);
                                messages.push({
                                    role: "tool",
                                    content: content
                                });
                                webReferences.push({ 
                                    query: query, 
                                    results: parsedResults
                                });
                            }
                          }
                
                          // Reset for next pass but keep UI state
                          fullResponse = "";
                          localNativeThinking = "";
                          displayedResponse = "";
                          displayedThinking = "";
                          // Loop again
                        } else {
                          isLooping = false;
                        }
                      }
                
                      cancelAnimationFrame(animationFrameId);
                      $botMsgContainer.html(formatThinkResponse(fullResponse, localNativeThinking, false));
                      if (finalMetrics) {
                        renderMetricsUI($botMsgContainer.siblings(".metrics-zone"), finalMetrics);
                      }
                      if (webReferences.length > 0) {
                        renderReferencesUI($botMsgContainer.siblings(".references-zone"), webReferences);
                      }
                      processMessageContent($botMsgContainer);
                      $chatArea.scrollTop($chatArea[0].scrollHeight);
                      chat.messages.push({ text: fullResponse, isUser: false, metrics: finalMetrics, webReferences: webReferences });
                      saveChats();
                    } catch (error) {
                      if (animationFrameId) cancelAnimationFrame(animationFrameId);
                      if (error.name === "AbortError") {
                        $botMsgContainer.html(
                          formatThinkResponse(
                            fullResponse + "\n\n*(Execution halted by user)*",
                            localNativeThinking,
                          ),
                        );
                        processMessageContent($botMsgContainer);
                      } else {
                        $botMsgContainer.html(
                          `<div class="flex flex-col gap-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                            <span class="text-xs font-black uppercase tracking-widest text-red-500">Sync Error</span>
                            <p class="text-sm font-medium text-red-600 dark:text-red-400">${error.message || "Engine Not Responding"}</p>
                          </div>`,
                        );
                      }
                    } finally {
                      if (animationFrameId) cancelAnimationFrame(animationFrameId);
                      $userInput.prop("disabled", false).focus();
                      $sendBtn.show().prop("disabled", false).removeClass("opacity-50");
                      $stopBtn.hide();
                      currentAbortController = null;
                    }
                  });
                
                  function parseJinaSearchResults(text) {
                    const results = [];
                    const blocks = text.split(/\[\d+\]\s+Title:/g).filter(b => b.trim());
                    
                    blocks.forEach(block => {
                        const titleMatch = block.match(/^([^\n]+)/);
                        const urlMatch = block.match(/URL Source:\s+([^\n]+)/);
                        const descMatch = block.match(/Description:\s+([\s\S]+?)(?=\n\n|\n\[|$)/);
                        
                        if (titleMatch && urlMatch) {
                            results.push({
                                title: titleMatch[1].trim(),
                                url: urlMatch[1].trim(),
                                description: descMatch ? descMatch[1].trim() : ""
                            });
                        }
                    });
                    return results;
                  }

                  function parseSearxngResults(text) {
                    const results = [];
                    const lines = text.split("\n");
                    let current = null;
                    for (let i = 0; i < lines.length; i++) {
                      const line = lines[i].trim();
                      const titleMatch = line.match(/^\[\d+\]\s+Title:\s+(.+)/);
                      if (titleMatch) {
                        if (current) results.push(current);
                        current = { title: titleMatch[1], url: "", description: "" };
                      } else if (current) {
                        const urlMatch = line.match(/URL Source:\s+(.+)/);
                        if (urlMatch) current.url = urlMatch[1];
                        const descMatch = line.match(/Description:\s+(.+)/);
                        if (descMatch) current.description = descMatch[1];
                      }
                    }
                    if (current) results.push(current);
                    return results;
                  }
  $newChatBtn.on("click", createNewChat);
  $chatList.on("click", ".chat-item", function () {
    loadChat($(this).data("id"));
    if (window.innerWidth < 768) {
      $sidebar.addClass("-translate-x-full");
    }
  });
  $openSidebar.on("click", () => $sidebar.removeClass("-translate-x-full"));
  $closeSidebar.on("click", () => $sidebar.addClass("-translate-x-full"));
  $stopBtn.on("click", function () {
    if (currentAbortController) {
      currentAbortController.abort();
    }
  });
  $userInput.on("input", function () {
    this.style.height = "auto";
    this.style.height = this.scrollHeight + "px";
  });
  $userInput.on("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      $chatForm.submit();
    }
  });
});
