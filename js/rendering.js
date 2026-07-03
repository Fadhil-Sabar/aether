(function (window, $) {
  const app = (window.AetherApp = window.AetherApp || {});

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function sanitizeHtml(html) {
    if (window.DOMPurify) {
      return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
    }
    return escapeHtml(html);
  }

  function configureMarked() {
    marked.setOptions({
      breaks: true,
      gfm: true,
    });
  }

  function safeUrl(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return "#";
    try {
      const parsed = new URL(raw, window.location.href);
      if (["http:", "https:", "mailto:"].includes(parsed.protocol)) {
        return parsed.href;
      }
    } catch (error) {}
    return "#";
  }

  function renderContextChips($contextPreview, activeContext) {
    $contextPreview.empty();
    activeContext.forEach(function (context, index) {
      const chipHtml = `
        <div class="flex items-center gap-2 px-3 py-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full text-[0.65rem] font-bold border border-zinc-300 dark:border-zinc-700 animate-in fade-in zoom-in">
          <span class="opacity-50">${context.type === "file" ? "📄" : "🔗"}</span>
          <span class="truncate max-w-[120px]">${escapeHtml(context.name)}</span>
          <button class="remove-ctx hover:text-red-500 transition-colors ml-1" aria-label="Remove ${escapeHtml(context.name)} from context" data-index="${index}">×</button>
        </div>
      `;
      $contextPreview.append(chipHtml);
    });
  }

  function renderReferencesUI($container, webRefs) {
    const refsHtml = `
      <div class="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/50">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-[0.55rem] font-black uppercase tracking-widest text-zinc-400">Web References</span>
        </div>
        <div class="flex flex-wrap gap-2">
          ${webRefs
            .map(function (ref, idx) {
              return `
                <div class="flex items-center gap-2 px-2 py-1 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-md text-[0.6rem] font-bold text-zinc-500">
                  <span class="opacity-50">🔍</span>
                  <span>${escapeHtml(ref.query || ref)}</span>
                  <button class="view-ref-details ml-1 opacity-40 hover:opacity-100 transition-opacity" aria-label="View search results for ${escapeHtml(ref.query || ref)}" data-index="${idx}">
                    <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M19 9l-7 7-7-7" /></svg>
                  </button>
                </div>
              `;
            })
            .join("")}
        </div>
      </div>
    `;
    $container.html(refsHtml);

    $container.find(".view-ref-details").on("click", function () {
      const idx = $(this).data("index");
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
      $content.append(
        '<p class="text-xs text-zinc-500">No results found or parsing failed.</p>',
      );
    } else {
      results.forEach(function (res) {
        const itemHtml = `
          <div class="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-1">
            <a href="${safeUrl(res.url)}" target="_blank" rel="noopener noreferrer" class="text-xs font-black text-zinc-900 dark:text-zinc-100 hover:underline flex items-center gap-2">
              ${escapeHtml(res.title)}
              <svg class="w-3 h-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
            </a>
            <span class="block text-[0.6rem] text-zinc-400 truncate">${escapeHtml(res.url)}</span>
            <p class="text-[0.65rem] leading-relaxed text-zinc-500 line-clamp-2">${escapeHtml(res.description)}</p>
          </div>
        `;
        $content.append(itemHtml);
      });
    }

    if (typeof app.openModal === "function") {
      app.openModal($modal, { initialFocus: "#close-reference-modal" });
    } else {
      $modal.attr("aria-hidden", "false").removeClass("hidden").addClass("flex");
    }
  }

  function renderMetricsUI($container, metrics) {
    if (!metrics) return;
    const ms = function (ns) {
      return `${(ns / 1000000).toFixed(0)} ms`;
    };
    const tps = metrics.eval_duration
      ? (metrics.eval_count / (metrics.eval_duration / 1000000000)).toFixed(1)
      : 0;
    const metricsHtml = `
      <div class="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/50">
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[0.6rem]">
          <div><span class="font-black text-zinc-400 uppercase tracking-widest">TPS</span><p class="font-bold mt-1">${tps}</p></div>
          <div><span class="font-black text-zinc-400 uppercase tracking-widest">Tokens</span><p class="font-bold mt-1">${metrics.eval_count || 0}</p></div>
          <div><span class="font-black text-zinc-400 uppercase tracking-widest">Total</span><p class="font-bold mt-1">${ms(metrics.total_duration)}</p></div>
          <div><span class="font-black text-zinc-400 uppercase tracking-widest">Load</span><p class="font-bold mt-1">${ms(metrics.load_duration)}</p></div>
          <div><span class="font-black text-zinc-400 uppercase tracking-widest">Prompt</span><p class="font-bold mt-1">${ms(metrics.prompt_eval_duration)}</p></div>
          <div><span class="font-black text-zinc-400 uppercase tracking-widest">Generate</span><p class="font-bold mt-1">${ms(metrics.eval_duration)}</p></div>
        </div>
      </div>
    `;
    $container.html(metricsHtml);
  }

  function safeMarkedParse(text, isStreaming) {
    const source = String(text ?? "")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    try {
      return marked.parse(source, { async: false });
    } catch (error) {
      const escaped = escapeHtml(source);
      return isStreaming ? escaped.replace(/\n/g, "<br>") : `<pre>${escaped}</pre>`;
    }
  }

  function formatThinkResponse(text, nativeThinking, isStreaming) {
    text = text || "";
    nativeThinking = nativeThinking || "";
    let isGeneratingCode = false;
    let codeLanguage = "code";

    function processPart(part) {
      const codeFenceMatch = part.match(/```([a-zA-Z0-9_-]+)/);
      if (codeFenceMatch) {
        isGeneratingCode = true;
        codeLanguage = codeFenceMatch[1] || "code";
      }
      return sanitizeHtml(safeMarkedParse(part, isStreaming));
    }

    let html = "";

    if (nativeThinking && !text.includes("<think>")) {
      html += `
        <div class="thought-block ${isStreaming ? "is-thinking" : ""}">
          <div class="thought-header">
            ${isStreaming ? '<div class="thinking-dot-mini"></div>' : '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>'}
            <span>${isStreaming ? "Thinking..." : "Thought Process"}</span>
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
      return { html: html, isGeneratingCode: isGeneratingCode, language: codeLanguage };
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

  function appendMessageUI(options) {
    const $chatArea = options.$chatArea;
    const text = options.text;
    const isUser = Boolean(options.isUser);
    const isHtml = Boolean(options.isHtml);
    const metrics = options.metrics || null;
    const webReferences = Array.isArray(options.webReferences)
      ? options.webReferences
      : [];
    const messageId = options.messageId;

    let content = "";
    if (isUser) {
      content = escapeHtml(text);
    } else if (isHtml) {
      content = sanitizeHtml(text);
    } else {
      const result = formatThinkResponse(text);
      content = typeof result === "string" ? result : result.html;
    }

    const messageHtml = `
      <div id="${messageId}" class="message-bubble w-full ${isUser ? "user-msg" : "bot-msg"}" data-message-id="${messageId}">
        <div class="content-box">
          <div class="prose-custom max-w-none">${content}</div>
          <div class="status-indicator-zone"></div>
          <div class="references-zone"></div>
          <div class="metrics-zone"></div>
          <div class="msg-actions flex gap-2 mt-2 opacity-0 msg-actions-visible transition-opacity">
            <button class="edit-msg text-[0.55rem] font-bold uppercase tracking-widest text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors px-2 py-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800" data-msg-id="${messageId}">Edit</button>
            <button class="delete-msg text-[0.55rem] font-bold uppercase tracking-widest text-zinc-400 hover:text-red-500 transition-colors px-2 py-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800" data-msg-id="${messageId}">Delete</button>
          </div>
        </div>
        ${!isUser ? "" : '<div class="mt-2 text-[10px] text-zinc-400 font-bold uppercase tracking-widest px-1 opacity-60 italic">Personal Transmission</div>'}
      </div>
    `;

    $chatArea.append(messageHtml);
    const $newMsg = $(`#${messageId}`);

    if (!isUser) {
      const $container = $newMsg.find(".prose-custom");
      processMessageContent($container);
      if (metrics) {
        renderMetricsUI($newMsg.find(".metrics-zone"), metrics);
      }
      if (webReferences.length > 0) {
        renderReferencesUI($newMsg.find(".references-zone"), webReferences);
      }
    }

    $chatArea.scrollTop($chatArea[0].scrollHeight);
    return messageId;
  }

  function showToast(message, type) {
    const colors = {
      info: "border-l-zinc-500 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300",
      success:
        "border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300",
      error:
        "border-l-red-500 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300",
      warning:
        "border-l-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300",
    };
    const toast = document.createElement("div");
    toast.className =
      "toast pointer-events-auto animate-in slide-in-from-right-4 fade-in duration-300 fill-mode-forwards border-l-4 rounded-lg px-4 py-3 text-xs font-bold shadow-lg " +
      (colors[type || "info"] || colors.info);
    toast.textContent = message;

    const container = document.getElementById("toast-container");
    if (!container) return;

    container.appendChild(toast);
    setTimeout(function () {
      toast.classList.add("opacity-0", "transition-opacity", "duration-300");
      setTimeout(function () {
        toast.remove();
      }, 300);
    }, 3500);
  }

  app.rendering = {
    appendMessageUI: appendMessageUI,
    configureMarked: configureMarked,
    escapeHtml: escapeHtml,
    formatThinkResponse: formatThinkResponse,
    processMessageContent: processMessageContent,
    renderContextChips: renderContextChips,
    renderMetricsUI: renderMetricsUI,
    renderReferencesUI: renderReferencesUI,
    safeUrl: safeUrl,
    sanitizeHtml: sanitizeHtml,
    showReferenceModal: showReferenceModal,
    showToast: showToast,
  };
})(window, jQuery);
