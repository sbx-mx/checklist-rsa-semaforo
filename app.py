"""Servidor Python sin dependencias para RSA Digital 3.2."""

from __future__ import annotations

import json
import mimetypes
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "data" / "checklist.json"
_DATA_LOCK = threading.Lock()
_DATA_CACHE: tuple[int, dict] | None = None


def load_checklist() -> dict:
    global _DATA_CACHE
    modified = DATA_FILE.stat().st_mtime_ns
    with _DATA_LOCK:
        if _DATA_CACHE and _DATA_CACHE[0] == modified:
            return _DATA_CACHE[1]
        payload = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        items = payload.get("items")
        if not isinstance(items, list) or not items:
            raise ValueError("La base del checklist está vacía")
        required = {"id", "question", "category", "section", "points"}
        for position, item in enumerate(items, 1):
            missing = required.difference(item)
            if missing:
                raise ValueError(f"Registro {position} incompleto: {', '.join(sorted(missing))}")
        identifiers = [item["id"] for item in items]
        if any(not value for value in identifiers) or len(identifiers) != len(set(identifiers)):
            raise ValueError("La base contiene IDs vacíos o duplicados")
        payload.setdefault("metadata", {})["item_count"] = len(items)
        _DATA_CACHE = (modified, payload)
        return payload


class RSAServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 64


class Handler(BaseHTTPRequestHandler):
    server_version = "RSADigital/3.2"

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} - {fmt % args}")

    def send_content(self, content: bytes, content_type: str, status: int = 200, *, cache: str = "no-cache"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", cache)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'")
        self.end_headers()
        self.wfile.write(content)

    def send_json(self, payload: dict, status: int = 200):
        self.send_content((json.dumps(payload, ensure_ascii=False) + "\n").encode(), "application/json; charset=utf-8", status)

    def do_GET(self):
        route = urlparse(self.path).path
        if route == "/api/health":
            try:
                payload = load_checklist()
                self.send_json({"ok": True, "items": payload["metadata"]["item_count"], "version": 3.2})
            except (OSError, ValueError, json.JSONDecodeError) as exc:
                self.send_json({"ok": False, "error": str(exc)}, 500)
            return
        if route == "/api/checklist":
            try:
                self.send_json(load_checklist())
            except (OSError, ValueError, json.JSONDecodeError) as exc:
                self.send_json({"error": str(exc)}, 500)
            return
        relative = "index.html" if route in {"", "/"} else route.lstrip("/")
        candidate = (ROOT / relative).resolve()
        if ROOT not in candidate.parents or not candidate.is_file():
            self.send_error(404)
            return
        mime = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
        cache = "public, max-age=300" if relative.startswith("static/") else "no-cache"
        self.send_content(candidate.read_bytes(), mime, cache=cache)


def create_server(host: str = "127.0.0.1", port: int = 8000) -> RSAServer:
    load_checklist()
    return RSAServer((host, port), Handler)


if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    server = create_server(host, port)
    print(f"RSA Digital 3.2: http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
