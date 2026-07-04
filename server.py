#!/usr/bin/env python3
"""
Aether Dev Server — static file server + OpenCode Go API proxy.
Zero dependencies. Run:  python3 server.py
"""
import http.server
import urllib.request
import json
import os
import sys
from urllib.parse import urlparse

PORT = int(os.environ.get("PORT", 8080))
OPENCODE_BASE = "https://opencode.ai/zen/go/v1"

# ── Static model list fallback (when proxy unavailable) ──
STATIC_MODELS = [
    "minimax-m3", "minimax-m2.7", "minimax-m2.5",
    "kimi-k2.7-code", "kimi-k2.6", "kimi-k2.5",
    "glm-5.2", "glm-5.1", "glm-5",
    "deepseek-v4-pro", "deepseek-v4-flash",
    "qwen3.7-max", "qwen3.7-plus", "qwen3.6-plus", "qwen3.5-plus",
    "mimo-v2-pro", "mimo-v2-omni", "mimo-v2.5-pro", "mimo-v2.5",
    "hy3-preview",
]

class AetherHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/api/models":
            return self._proxy_models()
        return super().do_GET()

    def do_POST(self):
        if self.path == "/api/chat":
            return self._proxy_chat()
        self.send_error(404)

    def _proxy_models(self):
        """Fetch models from OpenCode API, fallback to static list."""
        try:
            req = urllib.request.Request(f"{OPENCODE_BASE}/models")
            resp = urllib.request.urlopen(req, timeout=10)
            data = json.loads(resp.read())
            models = [m["id"] for m in data.get("data", []) if m.get("id")]
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"models": models}).encode())
        except Exception:
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"models": STATIC_MODELS}).encode())

    def _proxy_chat(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length)) if length else {}
            api_key = body.pop("api_key", "") or self.headers.get("X-Api-Key", "")

            req = urllib.request.Request(
                f"{OPENCODE_BASE}/chat/completions",
                data=json.dumps(body).encode(),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}" if api_key else "",
                },
            )
            resp = urllib.request.urlopen(req)
            self.send_response(200)
            self.send_header("Content-Type", resp.headers.get("Content-Type", "text/plain"))
            self.end_headers()
            # Stream response back
            while True:
                chunk = resp.read(4096)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(str(e).encode())

    def log_message(self, format, *args):
        print(f"[Aether] {args[0]} {args[1]} {args[2]}")

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print(f"\n  🚀 Aether Dev Server → http://localhost:{PORT}")
    print(f"  📡 Proxy → {OPENCODE_BASE}\n")
    http.server.HTTPServer(("", PORT), AetherHandler).serve_forever()
