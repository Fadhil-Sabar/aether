(function (window, $) {
  const app = (window.AetherApp = window.AetherApp || {});
  const stateStorage = app.stateStorage;
  const rendering = app.rendering;
  const searchProviders = app.searchProviders;
  const streamParser = app.streamParser;

  function initChatController() {
    if (app.__chatControllerInitialized) {
      return;
    }
    app.__chatControllerInitialized = true;

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
    const $settingsBtn = $("#settings-btn");
    const $settingsModal = $("#settings-modal");
    const $closeSettings = $("#close-settings");
    const $saveSettings = $("#save-settings");
    const $showMetricsToggle = $("#show-metrics-toggle");
    const $toolsEnabledToggle = $("#tools-enabled-toggle");
    const $settingsProviderSelect = $("#settings-provider-select");
    const $providerConfigSection = $("#provider-config-section");
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
    const $refModal = $("#reference-modal");
    const $closeRefModal = $("#close-reference-modal");
    const $appShell = $("#app-shell");
    const $footerVersion = $("#app-version-footer");

    if ($footerVersion.length) {
      $footerVersion.text(`Revision ${APP_VERSION}`);
    }

    const state = stateStorage.loadAppState();

    const modalState = new Map();

    function getFocusableElements($scope) {
      return $scope
        .find('a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')
        .filter(":visible");
    }

    function setAppInert(isInert) {
      if (!$appShell.length) return;
      $appShell.attr("aria-hidden", isInert ? "true" : "false");
      if ("inert" in $appShell[0]) {
        $appShell[0].inert = isInert;
      }
    }

    function openModal($modal, options) {
      const modal = $modal[0];
      if (!modal) return;
      modalState.set(modal, { trigger: document.activeElement || null });
      setAppInert(true);
      $modal.attr("aria-hidden", "false").removeClass("hidden").addClass("flex");
      const $dialog = $modal.children().first();
      const $focusables = getFocusableElements($dialog);
      const selector = options && options.initialFocus;
      const $initialTarget = selector ? $(selector) : $focusables.first();
      window.requestAnimationFrame(function () {
        ($initialTarget[0] || $dialog[0]).focus();
      });
    }

    function closeModal($modal) {
      const modal = $modal[0];
      if (!modal) return;
      const priorState = modalState.get(modal);
      $modal.attr("aria-hidden", "true").addClass("hidden").removeClass("flex");
      modalState.delete(modal);
      if ($('[role="dialog"][aria-hidden="false"]').length === 0) {
        setAppInert(false);
      }
      if (priorState && priorState.trigger && typeof priorState.trigger.focus === "function") {
        priorState.trigger.focus();
      }
    }

    app.openModal = openModal;
    app.closeModal = closeModal;

    function saveChats() {
      stateStorage.saveChats(state.chats);
    }

    function saveConfig() {
      stateStorage.saveConfig(state);
    }

    function getCurrentChat() {
      return stateStorage.findChatById(state.chats, state.currentChatId);
    }

    function setCurrentChatId(chatId) {
      state.currentChatId = chatId;
      stateStorage.saveCurrentChatId(chatId);
    }

    function resetActiveContext() {
      state.activeContext = [];
      rendering.renderContextChips($contextPreview, state.activeContext);
    }

    function addContext(type, name, content) {
      const exists = state.activeContext.some(function (context) {
        return context.name === name;
      });
      if (exists) return;
      state.activeContext.push({ type: type, name: name, content: content });
      rendering.renderContextChips($contextPreview, state.activeContext);
    }

    function removeContext(index) {
      state.activeContext.splice(index, 1);
      rendering.renderContextChips($contextPreview, state.activeContext);
    }

    function updateThinkUIVisibility() {
      const model = $modelSelect.val() || "";
      const isThinkModel = state.thinkModels.some(function (token) {
        return model.toLowerCase().includes(token);
      });
      if (isThinkModel) {
        $thinkConfig.removeClass("hidden").addClass("flex");
      } else {
        $thinkConfig.addClass("hidden").removeClass("flex");
      }
    }

    function appendMessage(message, options) {
      return rendering.appendMessageUI({
        $chatArea: $chatArea,
        text: message.text,
        isUser: message.isUser,
        isHtml: options && options.isHtml,
        metrics: message.metrics,
        webReferences: message.webReferences,
        messageId: message.id,
      });
    }

    function renderChatMessages(chat) {
      $chatArea.find(".message-bubble").remove();
      if (!chat || chat.messages.length === 0) {
        $welcomeScreen.show();
        return;
      }

      $welcomeScreen.hide();
      chat.messages.forEach(function (message) {
        appendMessage(message);
      });
    }

    function highlightActiveChat() {
      $(".chat-item").removeClass("active");
      $(".chat-item")
        .filter(function () {
          return $(this).data("id") === state.currentChatId;
        })
        .addClass("active");
    }

    function renderChatList() {
      $chatList.empty();
      state.chats.forEach(function (chat) {
        const activeClass = chat.id === state.currentChatId ? "active" : "";
        const chatItem = `
          <div class="chat-item ${activeClass}" data-id="${rendering.escapeHtml(chat.id)}">
            <span class="chat-title-text">${rendering.escapeHtml(chat.title)}</span>
            <div class="chat-item-actions">
              <button class="chat-action-btn rename-item" aria-label="Rename thread ${rendering.escapeHtml(chat.title)}" title="Rename" data-id="${rendering.escapeHtml(chat.id)}">✎</button>
              <button class="chat-action-btn delete-item" aria-label="Delete thread ${rendering.escapeHtml(chat.title)}" title="Delete" data-id="${rendering.escapeHtml(chat.id)}">×</button>
            </div>
          </div>
        `;
        $chatList.append(chatItem);
      });
    }

    function createNewChat() {
      const chat = stateStorage.createChat();
      state.chats.unshift(chat);
      saveChats();
      resetActiveContext();
      renderChatList();
      loadChat(chat.id);
      return chat;
    }

    function loadChat(chatId) {
      const chat = stateStorage.findChatById(state.chats, chatId);
      if (!chat) return;
      setCurrentChatId(chat.id);
      resetActiveContext();
      $currentChatTitle.text(chat.title);
      renderChatMessages(chat);
      highlightActiveChat();
      $chatArea.scrollTop($chatArea[0].scrollHeight);
    }

    function deleteChat(chatId) {
      if (!window.confirm("Delete this thread permanently?")) return;

      state.chats = state.chats.filter(function (chat) {
        return chat.id !== chatId;
      });
      saveChats();

      if (state.currentChatId === chatId) {
        if (state.chats.length > 0) {
          loadChat(state.chats[0].id);
        } else {
          createNewChat();
        }
      }

      renderChatList();
    }

    function renameChat(chatId) {
      const chat = stateStorage.findChatById(state.chats, chatId);
      if (!chat) return;
      const newTitle = window.prompt("New Thread Name:", chat.title);
      if (!newTitle || !newTitle.trim()) return;
      chat.title = newTitle.trim();
      saveChats();
      renderChatList();
      if (state.currentChatId === chatId) {
        $currentChatTitle.text(chat.title);
      }
    }

    function findMessageRecord(messageId) {
      const chat = getCurrentChat();
      if (!chat) return null;
      const index = chat.messages.findIndex(function (message) {
        return message.id === messageId;
      });
      if (index === -1) return null;
      return { chat: chat, index: index, message: chat.messages[index] };
    }

    function handleDeleteMessage(messageId) {
      const record = findMessageRecord(messageId);
      if (!record) return;
      record.chat.messages.splice(record.index, 1);
      saveChats();
      $chatArea.find(`[data-message-id="${messageId}"]`).remove();
      rendering.showToast("Message deleted", "info");
      if (record.chat.messages.length === 0) {
        $welcomeScreen.show();
      }
    }

    function handleEditMessage(messageId) {
      const record = findMessageRecord(messageId);
      if (!record) return;
      if (!record.message.isUser) {
        rendering.showToast("Only user messages can be edited", "warning");
        return;
      }
      $userInput.val(record.message.text).trigger("input").focus();
      record.chat.messages.splice(record.index, 1);
      saveChats();
      $chatArea.find(`[data-message-id="${messageId}"]`).remove();
      if (record.chat.messages.length === 0) {
        $welcomeScreen.show();
      }
      rendering.showToast("Edit your message and send", "info");
    }

    function checkTheme() {
      const theme = localStorage.getItem(stateStorage.STORAGE_KEYS.theme);
      const isDark =
        theme === "dark" ||
        (!theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
      if (isDark) {
        $("html").addClass("dark");
      }
    }

    function loadConfigToInputs() {
      $tempInput.val(state.configParams.temperature);
      $ctxInput.val(state.configParams.num_ctx);
      $topPInput.val(state.configParams.top_p);
      $topKInput.val(state.configParams.top_k);
      $showMetricsToggle.prop("checked", state.showMetrics);
      $toolsEnabledToggle.prop("checked", state.toolsEnabled);
      $webSearchToggle.prop("checked", state.webSearchEnabled);
      $jinaApiKeyInput.val(state.jinaApiKey);
      if (state.searchProvider === "jina") {
        $providerJina.prop("checked", true);
      } else {
        $providerSearxng.prop("checked", true);
      }
      $searxngUrlInput.val(state.searxngUrl);
      $sysPromptInput.val(state.customSystemPrompt);
      $("#external-access-note").text(
        state.searchProvider === "searxng"
          ? `External link analysis uses Jina Reader. Web search queries go to SearXNG at ${state.searxngUrl}. The app will ask for confirmation before each external request.`
          : "External link analysis uses Jina Reader. Web search queries go to Jina Search. The app will ask for confirmation before each external request.",
      );
    }

    async function fetchModels() {
      const activeProvider = app.providers.getActiveProvider();
      const previousValue = $modelSelect.val();
      $modelSelect.empty();

      if (activeProvider.type === "openai") {
        try {
          const models = await app.openaiProvider.fetchModels(activeProvider);
          if (models.length > 0) {
            models.forEach(function (name) {
              $("<option>").val(name).text(name).appendTo($modelSelect);
            });
            if (previousValue) {
              $modelSelect.val(previousValue);
            }
          } else {
            $modelSelect.append('<option value="">No Models</option>');
          }
        } catch (error) {
          $modelSelect.empty().append('<option value="">Offline</option>');
        }
        updateThinkUIVisibility();
        return;
      }

      // Generic adapter-based fetch for other providers
      try {
        const adapter = app.adapters[activeProvider.type];
        if (!adapter || typeof adapter.fetchModels !== "function") {
          $modelSelect.append('<option value="">Unsupported</option>');
          updateThinkUIVisibility();
          return;
        }
        const models = await adapter.fetchModels(activeProvider.baseUrl, activeProvider.apiKey);
        if (models.length > 0) {
          models.forEach(function (model) {
            $("<option>").val(model.name).text(model.name).appendTo($modelSelect);
          });
          if (previousValue) {
            $modelSelect.val(previousValue);
          }
        } else {
          $modelSelect.append('<option value="">No Models</option>');
        }
      } catch (error) {
        $modelSelect.empty().append('<option value="">Offline</option>');
      }
      updateThinkUIVisibility();
    }

    function buildMessagesPayload(chat, rawMessage) {
      const messages = [
        { role: "system", content: state.customSystemPrompt },
      ];
      const recentHistory = chat.messages.slice(-10);
      recentHistory.forEach(function (message) {
        messages.push({
          role: message.isUser ? "user" : "assistant",
          content: message.text,
        });
      });

      let userMessageWithContext = "";
      if (state.activeContext.length > 0) {
        userMessageWithContext += "### PRIMARY KNOWLEDGE SOURCE (PINNED):\n";
        state.activeContext.forEach(function (context) {
          userMessageWithContext += `DOCUMENT [${context.name}]: ${context.content}\n\n`;
        });
        userMessageWithContext +=
          "### INSTRUCTION:\nBased on the provided documents, answer the following question. If the information isn't present, use your general knowledge but clearly state so.\n\n";
      }
      userMessageWithContext += `### USER QUESTION:\n${rawMessage}`;
      messages.push({ role: "user", content: userMessageWithContext });
      return messages;
    }

    function buildBaseTools() {
      if (!state.toolsEnabled) return undefined;

      const tools = [
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
                  description: "The URL to fetch content from",
                },
              },
              required: ["url"],
            },
          },
        },
      ];

      if (state.webSearchEnabled) {
        tools.push({
          type: "function",
          function: {
            name: "web_search",
            description: "Search the web to find up-to-date information on a specific topic",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The search query to look for",
                },
              },
              required: ["query"],
            },
          },
        });
      }

      return tools;
    }

    async function executeToolCall(toolCall, messages, $indicatorZone, webReferences) {
      const fn = toolCall.function || {};
      const name = fn.name;
      const args = fn.arguments || {};

      if (name === "process_link") {
        const url = args.url;
        $indicatorZone.html(
          `<div class="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400 py-2"><div class="spinner-mini"></div><span>Executing tool: process_link(${rendering.escapeHtml(url)})</span></div>`,
        );

        let content;
        try {
          content = await searchProviders.fetchLinkContent(url);
        } catch (error) {
          content = `Error: ${error.message || `Could not analyze the link ${url}.`}`;
        }
        messages.push({ role: "tool", content: content });
        if (!/^Error:/i.test(content)) {
          const normalized = searchProviders.normalizeExternalHttpUrl(url);
          if (normalized.ok) {
            addContext("link", normalized.url, content);
          }
        }
        return;
      }

      if (name === "web_search") {
        const query = args.query;
        const providerLabel = state.searchProvider === "searxng" ? "SearXNG" : "Jina AI";
        $indicatorZone.html(
          `<div class="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400 py-2"><div class="spinner-mini"></div><span>Executing tool: web_search("${rendering.escapeHtml(query)}") via ${rendering.escapeHtml(providerLabel)}</span></div>`,
        );

        const content =
          state.searchProvider === "searxng"
            ? await searchProviders.fetchSearxngContent(query, state.searxngUrl)
            : await searchProviders.fetchWebSearchContent(query, state.jinaApiKey);

        const parsedResults =
          state.searchProvider === "searxng"
            ? searchProviders.parseSearxngResults(content)
            : searchProviders.parseJinaSearchResults(content);

        messages.push({ role: "tool", content: content });
        webReferences.push({ query: query, results: parsedResults });
      }
    }

    async function submitChat(event) {
      event.preventDefault();
      const rawMessage = $userInput.val().trim();
      const selectedModel = $modelSelect.val();
      if (!rawMessage || !selectedModel) return;

      const urlMatch = rawMessage.match(/https?:\/\/[^\s]+/i);
      if (urlMatch && state.activeContext.length === 0) {
        await searchProviders.processLink(urlMatch[0], {
          addContext: addContext,
          showToast: rendering.showToast,
        });
      }

      if (!state.currentChatId) {
        createNewChat();
      }
      const chat = getCurrentChat();
      if (!chat) return;

      $welcomeScreen.hide();
      const userMessage = stateStorage.createMessage({
        text: rawMessage,
        isUser: true,
      });
      appendMessage(userMessage);
      $userInput.val("").css("height", "auto");

      let thinkValue = false;
      if ($thinkToggle.is(":checked")) {
        const level = $thinkLevel.val();
        thinkValue = level === "true" ? true : level;
      }

      const messages = buildMessagesPayload(chat, rawMessage);
      chat.messages.push(userMessage);
      if (chat.title === "Untitled") {
        chat.title = rawMessage.substring(0, 30);
        $currentChatTitle.text(chat.title);
        renderChatList();
      }
      saveChats();

      $userInput.prop("disabled", true);
      $sendBtn.prop("disabled", true).addClass("opacity-50");

      const baseTools = buildBaseTools();
      const botMessage = stateStorage.createMessage({
        text:
          '<div class="thinking-container"><div class="dot dot-1"></div><div class="dot dot-2"></div><div class="dot dot-3"></div></div>',
        isUser: false,
      });
      appendMessage(botMessage, { isHtml: true });

      const $botBubble = $chatArea.find(`[data-message-id="${botMessage.id}"]`);
      const $botMsgContainer = $botBubble.find(".prose-custom");
      const $indicatorZone = $botBubble.find(".status-indicator-zone");

      let fullResponse = "";
      let localNativeThinking = "";
      let finalMetrics = null;
      const webReferences = [];
      let animationFrameId = null;

      $sendBtn.hide();
      $stopBtn.removeClass("hidden").show();
      state.currentAbortController = new AbortController();

      try {
        let displayedResponse = "";
        let displayedThinking = "";

        const smoothUpdate = function () {
          let hasNewContent = false;
          const threshold = 50;
          const isAtBottom =
            $chatArea[0].scrollHeight -
              $chatArea.scrollTop() -
              $chatArea.outerHeight() <
            threshold;

          if (displayedThinking.length < localNativeThinking.length) {
            const syncSpeed = Math.ceil(
              (localNativeThinking.length - displayedThinking.length) / 5,
            );
            displayedThinking += localNativeThinking.substring(
              displayedThinking.length,
              displayedThinking.length + syncSpeed,
            );
            hasNewContent = true;
          }

          if (displayedResponse.length < fullResponse.length) {
            const syncSpeed = Math.ceil(
              (fullResponse.length - displayedResponse.length) / 4,
            );
            displayedResponse += fullResponse.substring(
              displayedResponse.length,
              displayedResponse.length + syncSpeed,
            );
            hasNewContent = true;
          }

          if (hasNewContent) {
            const result = rendering.formatThinkResponse(
              displayedResponse,
              displayedThinking,
              true,
            );
            $botMsgContainer.html(result.html);
            if (result.isGeneratingCode) {
              if ($indicatorZone.children().length === 0) {
                $indicatorZone.html(
                  `<div class="code-generating-indicator"><div class="spinner"></div><span>Generating ${rendering.escapeHtml(result.language)}...</span><div class="cursor"></div></div>`,
                );
              } else {
                $indicatorZone
                  .find("span")
                  .text(`Generating ${result.language}...`);
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

        const provider = app.providers.getActiveProvider();
        const adapter = app.adapters[provider.type];
        if (!adapter || typeof adapter.chat !== "function") {
          throw new Error("No chat adapter for provider type: " + provider.type);
        }

        let isLooping = true;
        while (isLooping) {
          const toolCallsInPass = [];

          await adapter.chat(provider.baseUrl, provider.apiKey, messages, {
            model: selectedModel,
            tools: baseTools,
            think: thinkValue,
            config: state.configParams,
          }, {
            onContent: function (text) {
              fullResponse += text;
            },
            onThinking: function (text) {
              localNativeThinking += text;
            },
            onToolCalls: function (calls) {
              toolCallsInPass.push.apply(toolCallsInPass, calls);
            },
            onDone: function (metadata) {
              if (metadata.context) {
                chat.context = metadata.context;
              }
              if (metadata.metrics) {
                finalMetrics = metadata.metrics;
              }
            },
          }, state.currentAbortController.signal);

          if (toolCallsInPass.length > 0) {
            messages.push({
              role: "assistant",
              content: fullResponse,
              tool_calls: toolCallsInPass,
            });

            for (const toolCall of toolCallsInPass) {
              await executeToolCall(toolCall, messages, $indicatorZone, webReferences);
            }

            fullResponse = "";
            localNativeThinking = "";
            displayedResponse = "";
            displayedThinking = "";
          } else {
            isLooping = false;
          }
        }

        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        $botMsgContainer.html(
          rendering.formatThinkResponse(fullResponse, localNativeThinking, false),
        );
        if (finalMetrics && state.showMetrics) {
          rendering.renderMetricsUI($botBubble.find(".metrics-zone"), finalMetrics);
        } else {
          $botBubble.find(".metrics-zone").empty();
        }
        if (webReferences.length > 0) {
          rendering.renderReferencesUI($botBubble.find(".references-zone"), webReferences);
        }
        rendering.processMessageContent($botMsgContainer);
        $chatArea.scrollTop($chatArea[0].scrollHeight);

        chat.messages.push(
          stateStorage.createMessage({
            id: botMessage.id,
            text: fullResponse,
            isUser: false,
            metrics: finalMetrics,
            webReferences: webReferences,
          }),
        );
        saveChats();
      } catch (error) {
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        if (error.name === "AbortError") {
          $botMsgContainer.html(
            rendering.formatThinkResponse(
              `${fullResponse}\n\n*(Execution halted by user)*`,
              localNativeThinking,
            ),
          );
          rendering.processMessageContent($botMsgContainer);
        } else {
          $botMsgContainer.html(
            `<div class="flex flex-col gap-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl"><span class="text-xs font-black uppercase tracking-widest text-red-500">Sync Error</span><p class="text-sm font-medium text-red-600 dark:text-red-400">${rendering.escapeHtml(error.message || "Engine Not Responding")}</p></div>`,
          );
        }
      } finally {
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        $userInput.prop("disabled", false).focus();
        $sendBtn.show().prop("disabled", false).removeClass("opacity-50");
        $stopBtn.hide();
        state.currentAbortController = null;
      }
    }

    function init() {
      rendering.configureMarked();
      renderChatList();
      if (state.currentChatId) {
        loadChat(state.currentChatId);
      }
      checkTheme();
      loadConfigToInputs();
      fetchModels();
      if (!getCurrentChat()) {
        if (state.chats.length === 0) {
          createNewChat();
        } else {
          loadChat(state.chats[0].id);
        }
      }
    }

    $modelSelect.on("change", updateThinkUIVisibility);
    $attachBtn.on("click", function () {
      $fileUpload.click();
    });
    $fileUpload.on("change", function (event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (loadEvent) {
        addContext("file", file.name, loadEvent.target.result);
      };
      reader.readAsText(file);
      $fileUpload.val("");
    });
    $contextPreview.on("click", ".remove-ctx", function () {
      removeContext($(this).data("index"));
    });
    $chatList.on("click", ".delete-item", function (event) {
      event.stopPropagation();
      deleteChat($(this).data("id"));
    });
    $chatList.on("click", ".rename-item", function (event) {
      event.stopPropagation();
      renameChat($(this).data("id"));
    });
    $chatArea.on("click", ".copy-btn", function () {
      const $btn = $(this);
      const text = $btn.siblings("code").text();
      navigator.clipboard.writeText(text).then(function () {
        $btn.text("COPIED!").addClass("copied");
        setTimeout(function () {
          $btn.text("COPY").removeClass("copied");
        }, 2000);
      });
    });
    $chatArea.on("click", ".delete-msg", function () {
      handleDeleteMessage($(this).data("msg-id"));
    });
    $chatArea.on("click", ".edit-msg", function () {
      handleEditMessage($(this).data("msg-id"));
    });
    $themeToggle.on("click", function () {
      $("html").toggleClass("dark");
      const isDark = $("html").hasClass("dark");
      localStorage.setItem(
        stateStorage.STORAGE_KEYS.theme,
        isDark ? "dark" : "light",
      );
    });
    $(document).on("keydown", function (event) {
      const $activeModal = $('[role="dialog"][aria-hidden="false"]').last();
      if (!$activeModal.length) return;

      if (event.key === "Escape") {
        event.preventDefault();
        closeModal($activeModal);
        return;
      }

      if (event.key !== "Tab") return;

      const $dialog = $activeModal.children().first();
      const $focusables = getFocusableElements($dialog);
      if ($focusables.length === 0) {
        event.preventDefault();
        $dialog.trigger("focus");
        return;
      }

      const first = $focusables[0];
      const last = $focusables[$focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    $settingsBtn.on("click", function () {
      $sysPromptInput.val(state.customSystemPrompt);
      openModal($settingsModal, { initialFocus: "#temp-input" });
    });
    $closeSettings.on("click", function () {
      closeModal($settingsModal);
    });
    $saveSettings.on("click", function () {
      state.showMetrics = $showMetricsToggle.is(":checked");
      state.toolsEnabled = $toolsEnabledToggle.is(":checked");
      state.webSearchEnabled = $webSearchToggle.is(":checked");
      state.jinaApiKey = String($jinaApiKeyInput.val() || "").trim();
      state.searchProvider = $providerSearxng.is(":checked") ? "searxng" : "jina";
      const normalizedSearxngUrl = searchProviders.normalizeServiceUrl(
        $searxngUrlInput.val(),
        "http://172.17.0.1:8080",
      );
      if (!normalizedSearxngUrl.ok) {
        rendering.showToast(normalizedSearxngUrl.error, "error");
        return;
      }
      state.searxngUrl = normalizedSearxngUrl.url;
      state.configParams = stateStorage.normalizeConfigParams({
        temperature: $tempInput.val(),
        num_ctx: $ctxInput.val(),
        top_p: $topPInput.val(),
        top_k: $topKInput.val(),
      });
      saveConfig();
      loadConfigToInputs();
      if (state.currentChatId) {
        loadChat(state.currentChatId);
      }
      closeModal($settingsModal);
      rendering.showToast(
        "Settings updated. External link/search requests now require confirmation.",
        "success",
      );
    });
    $settingsModal.on("click", function (event) {
      if (event.target === this) {
        closeModal($(this));
      }
    });
    $closeRefModal.on("click", function () {
      closeModal($refModal);
    });
    $refModal.on("click", function (event) {
      if (event.target === this) {
        closeModal($(this));
      }
    });
    $closeSysPrompt.on("click", function () {
      closeModal($sysPromptModal);
    });
    $sysPromptModal.on("click", function (event) {
      if (event.target === this) {
        closeModal($(this));
      }
    });
    $currentChatTitle.parent().parent().on("dblclick", function () {
      $sysPromptInput.val(state.customSystemPrompt);
      openModal($sysPromptModal, { initialFocus: "#system-prompt-input" });
    });
    $saveSysPrompt.on("click", function () {
      const newPrompt = String($sysPromptInput.val() || "").trim();
      if (newPrompt) {
        state.customSystemPrompt = newPrompt.slice(0, 16000);
        saveConfig();
        rendering.showToast("System prompt updated", "success");
      }
      closeModal($sysPromptModal);
    });
    $exportBtn.on("click", function () {
      if (state.chats.length === 0) {
        rendering.showToast("No chats to export", "warning");
        return;
      }
      const exportData = JSON.stringify(
        {
          version: APP_VERSION,
          exportedAt: new Date().toISOString(),
          chats: state.chats,
        },
        null,
        2,
      );
      const blob = new Blob([exportData], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `aether-chats-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      rendering.showToast(`Exported ${state.chats.length} chat(s)`, "success");
    });
    $importBtn.on("click", function () {
      $importFileInput.click();
    });
    $importFileInput.on("change", function (event) {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > stateStorage.MAX_IMPORT_FILE_BYTES) {
        rendering.showToast(
          `Import failed: file exceeds ${Math.round(stateStorage.MAX_IMPORT_FILE_BYTES / (1024 * 1024))} MB limit`,
          "error",
        );
        $importFileInput.val("");
        return;
      }
      const reader = new FileReader();
      reader.onload = function (loadEvent) {
        try {
          const data = stateStorage.parseJsonText(
            loadEvent.target.result,
            null,
            `import file ${file.name}`,
          );
          const normalizedChats = stateStorage.normalizeImportedPayload(data);
          const existingIds = new Set(
            state.chats.map(function (chat) {
              return chat.id;
            }),
          );
          const imported = normalizedChats
            .filter(function (chat) {
              return !existingIds.has(chat.id);
            });
          if (imported.length === 0) {
            rendering.showToast("All chats already exist", "warning");
            return;
          }
          state.chats = imported.concat(state.chats);
          saveChats();
          renderChatList();
          rendering.showToast(`Imported ${imported.length} chat(s)`, "success");
        } catch (error) {
          rendering.showToast(`Import failed: ${error.message}`, "error");
        }
      };
      reader.onerror = function () {
        rendering.showToast("Import failed: could not read file", "error");
      };
      reader.readAsText(file);
      $importFileInput.val("");
    });
    $chatForm.on("submit", submitChat);
    $newChatBtn.on("click", createNewChat);
    $chatList.on("click", ".chat-item", function () {
      loadChat($(this).data("id"));
      if (window.innerWidth < 768) {
        $sidebar.addClass("-translate-x-full");
        $openSidebar.attr("aria-expanded", "false");
      }
    });
    $openSidebar.attr("aria-controls", "sidebar").attr("aria-expanded", "false");
    $openSidebar.on("click", function () {
      $sidebar.removeClass("-translate-x-full");
      $openSidebar.attr("aria-expanded", "true");
    });
    $closeSidebar.on("click", function () {
      $sidebar.addClass("-translate-x-full");
      $openSidebar.attr("aria-expanded", "false");
      $openSidebar.trigger("focus");
    });
    $stopBtn.on("click", function () {
      if (state.currentAbortController) {
        state.currentAbortController.abort();
      }
    });
    $userInput.on("input", function () {
      this.style.height = "auto";
      this.style.height = `${this.scrollHeight}px`;
    });
    $userInput.on("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        $chatForm.trigger("submit");
      }
    });

    init();
  }

  app.initChatController = initChatController;
})(window, jQuery);
