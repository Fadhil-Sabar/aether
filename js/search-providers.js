(function (window) {
  const app = (window.AetherApp = window.AetherApp || {});

  function trimDetectedUrl(value) {
    let trimmed = String(value ?? "").trim();
    while (/[.,!?;:]$/.test(trimmed)) {
      trimmed = trimmed.slice(0, -1);
    }
    while (trimmed.endsWith(")")) {
      const opens = (trimmed.match(/\(/g) || []).length;
      const closes = (trimmed.match(/\)/g) || []).length;
      if (closes <= opens) break;
      trimmed = trimmed.slice(0, -1);
    }
    return trimmed;
  }

  function isPrivateOrLocalHostname(hostname) {
    const host = String(hostname ?? "").toLowerCase();
    if (!host) return true;
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
    if (/^169\.254\./.test(host) || /^0\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
    if (host === "::1" || host === "[::1]" || host === "::" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return true;
    return false;
  }

  function normalizeExternalHttpUrl(value) {
    const trimmed = trimDetectedUrl(value);
    if (!trimmed) {
      return { ok: false, error: "No URL provided." };
    }

    let parsed;
    try {
      parsed = new URL(trimmed);
    } catch (error) {
      return { ok: false, error: "Invalid URL. Use a full http:// or https:// link." };
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { ok: false, error: "Only http:// and https:// URLs can be analyzed." };
    }

    if (isPrivateOrLocalHostname(parsed.hostname)) {
      return { ok: false, error: "Localhost and private-network URLs are blocked for external link analysis." };
    }

    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";

    const normalizedUrl = parsed.toString();
    return {
      ok: true,
      url: normalizedUrl,
      readerUrl: `https://r.jina.ai/${encodeURI(normalizedUrl)}`,
    };
  }

  function normalizeServiceUrl(value, fallbackUrl) {
    const raw = String(value ?? "").trim();
    if (!raw) {
      return { ok: true, url: fallbackUrl };
    }

    try {
      const parsed = new URL(raw);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Only http:// and https:// service URLs are supported.");
      }
      parsed.username = "";
      parsed.password = "";
      parsed.hash = "";
      return { ok: true, url: parsed.toString().replace(/\/+$/, "") };
    } catch (error) {
      return { ok: false, error: error.message || "Invalid service URL." };
    }
  }

  function confirmExternalRequest(kind, target, providerLabel) {
    const detail = String(target ?? "").trim();
    const subject = kind === "link" ? "URL" : "search query";
    return window.confirm(
      `This action will send the following ${subject} to ${providerLabel}:\n\n${detail}\n\nContinue?`,
    );
  }

  async function processLink(url, callbacks) {
    const addContext = callbacks && callbacks.addContext;
    const showToast = callbacks && callbacks.showToast;

    try {
      const normalized = normalizeExternalHttpUrl(url);
      if (!normalized.ok) throw new Error(normalized.error);
      if (!confirmExternalRequest("link", normalized.url, "Jina Reader")) {
        if (typeof showToast === "function") {
          showToast("Link analysis cancelled. Nothing was sent to Jina Reader.", "info");
        }
        return;
      }
      const content = await fetchLinkContent(normalized.url, { skipConfirm: true });
      if (typeof addContext === "function") {
        addContext("link", normalized.url, content);
      }
    } catch (error) {
      console.error("Link analysis failed:", error);
      if (typeof showToast === "function") {
        showToast(error.message || "Could not analyze the link. Make sure it's valid.", "error");
      }
    }
  }

  async function fetchLinkContent(url, options) {
    const normalized = normalizeExternalHttpUrl(url);
    if (!normalized.ok) {
      throw new Error(normalized.error);
    }
    if (!(options && options.skipConfirm)) {
      const approved = confirmExternalRequest("link", normalized.url, "Jina Reader");
      if (!approved) {
        throw new Error("User declined sending the URL to Jina Reader.");
      }
    }

    const response = await fetch(normalized.readerUrl, {
      headers: { "X-No-Cache": "true" },
    });
    if (!response.ok) {
      throw new Error("Failed to fetch link content");
    }
    return await response.text();
  }

  async function fetchWebSearchContent(query, jinaApiKey) {
    const jinaSearchUrl = `https://s.jina.ai/?q=${encodeURIComponent(query)}`;
    const headers = { "X-Respond-With": "no-content" };
    if (jinaApiKey) {
      headers.Authorization = `Bearer ${jinaApiKey}`;
    }

    try {
      if (!confirmExternalRequest("search", query, "Jina Search")) {
        throw new Error("User declined sending the search query to Jina Search.");
      }
      const response = await fetch(jinaSearchUrl, { headers: headers });
      if (!response.ok) throw new Error("Web search failed");
      return await response.text();
    } catch (error) {
      console.error("Web search failed:", error);
      return `Error: ${error.message || `Web search for "${query}" failed.`}`;
    }
  }

  async function fetchSearxngContent(query, searxngUrl) {
    const url = searxngUrl.replace(/\/+$/, "") + "/search";
    try {
      if (!confirmExternalRequest("search", query, `SearXNG (${searxngUrl})`)) {
        throw new Error("User declined sending the search query to SearXNG.");
      }
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body:
          "q=" +
          encodeURIComponent(query) +
          "&format=json&language=en&categories=general",
      });
      if (!response.ok) {
        throw new Error(`SearXNG search failed: ${response.status}`);
      }
      const data = await response.json();
      let result = "";
      if (data.answers && data.answers.length > 0) {
        result += `Answers:\n${data.answers.join("\n")}\n\n`;
      }
      if (data.results && data.results.length > 0) {
        data.results.forEach(function (item, index) {
          result += `[${index + 1}] Title: ${item.title || "Untitled"}\n`;
          result += `   URL Source: ${item.url || ""}\n`;
          result += `   Description: ${item.content || ""}\n\n`;
        });
      }
      if (!result.trim()) {
        result = `No results found for: ${query}`;
      }
      return result;
    } catch (error) {
      console.error("SearXNG search failed:", error);
      return `Error: ${error.message || `SearXNG search for "${query}" failed. Make sure SearXNG is running at ${searxngUrl}`}`;
    }
  }

  function parseJinaSearchResults(text) {
    const results = [];
    const blocks = text.split(/\[\d+\]\s+Title:/g).filter(function (block) {
      return block.trim();
    });

    blocks.forEach(function (block) {
      const titleMatch = block.match(/^([^\n]+)/);
      const urlMatch = block.match(/URL Source:\s+([^\n]+)/);
      const descMatch = block.match(
        /Description:\s+([\s\S]+?)(?=\n\n|\n\[|$)/,
      );

      if (titleMatch && urlMatch) {
        results.push({
          title: titleMatch[1].trim(),
          url: urlMatch[1].trim(),
          description: descMatch ? descMatch[1].trim() : "",
        });
      }
    });

    return results;
  }

  function parseSearxngResults(text) {
    const results = [];
    const lines = text.split("\n");
    let current = null;

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();
      const titleMatch = line.match(/^\[\d+\]\s+Title:\s+(.+)/);
      if (titleMatch) {
        if (current) results.push(current);
        current = { title: titleMatch[1], url: "", description: "" };
        continue;
      }

      if (!current) continue;
      const urlMatch = line.match(/URL Source:\s+(.+)/);
      if (urlMatch) current.url = urlMatch[1];
      const descMatch = line.match(/Description:\s+(.+)/);
      if (descMatch) current.description = descMatch[1];
    }

    if (current) results.push(current);
    return results;
  }

  app.searchProviders = {
    fetchLinkContent: fetchLinkContent,
    fetchSearxngContent: fetchSearxngContent,
    fetchWebSearchContent: fetchWebSearchContent,
    normalizeExternalHttpUrl: normalizeExternalHttpUrl,
    normalizeServiceUrl: normalizeServiceUrl,
    parseJinaSearchResults: parseJinaSearchResults,
    parseSearxngResults: parseSearxngResults,
    processLink: processLink,
  };
})(window);
