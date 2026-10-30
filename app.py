from __future__ import annotations

import json
import os
import threading
import urllib.error
import urllib.request
from datetime import date, datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).parent
DATA = ROOT / "data" / "memories.json"
LOCK = threading.Lock()

SAMPLE = [
    {
        "id": "sample-1",
        "person": "Amma",
        "title": "The Sunday lemon rice",
        "story": "She made lemon rice on Sundays when cousins came over. She always toasted the peanuts separately so they stayed crunchy.",
        "details": "The steel dabba on the counter; curry leaves from the little balcony pot.",
        "date": "2026-10-30",
        "created_at": "2026-10-30T00:00:00+00:00",
        "sample": True,
    }
]


def read_memories():
    DATA.parent.mkdir(parents=True, exist_ok=True)
    if not DATA.exists():
        write_memories(SAMPLE)
    try:
        return json.loads(DATA.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []


def write_memories(items):
    DATA.parent.mkdir(parents=True, exist_ok=True)
    temp = DATA.with_suffix(".tmp")
    temp.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(DATA)


class Handler(BaseHTTPRequestHandler):
    server_version = "MemoryLantern/1.0"

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}")

    def send_json(self, status, value):
        body = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def body_json(self):
        size = int(self.headers.get("Content-Length", "0"))
        if size > 100_000:
            raise ValueError("That note is too large (100 KB max).")
        return json.loads(self.rfile.read(size) or b"{}")

    def do_GET(self):
        route = urlparse(self.path).path
        if route == "/api/memories":
            with LOCK:
                return self.send_json(200, read_memories())
        if route == "/api/status":
            try:
                req = urllib.request.Request("http://127.0.0.1:11434/api/tags")
                with urllib.request.urlopen(req, timeout=1) as response:
                    tags = json.load(response).get("models", [])
                ready = any(m.get("name", "").split(":")[0] == "gemma4" for m in tags)
                return self.send_json(200, {"ollama": True, "gemma": ready})
            except (OSError, urllib.error.URLError, TimeoutError):
                return self.send_json(200, {"ollama": False, "gemma": False})
        if route == "/" or route == "/index.html":
            return self.send_file(ROOT / "index.html")
        if route in ("/style.css", "/offline.css", "/app.js"):
            return self.send_file(ROOT / route[1:])
        return self.send_json(404, {"error": "Not found"})

    def send_file(self, path):
        try:
            payload = path.read_bytes()
        except OSError:
            return self.send_json(404, {"error": "File not found"})
        kind = ".css" if path.suffix == ".css" else ".js" if path.suffix == ".js" else ".html"
        mime = {".css": "text/css", ".js": "text/javascript", ".html": "text/html"}[kind]
        self.send_response(200)
        self.send_header("Content-Type", f"{mime}; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        route = urlparse(self.path).path
        try:
            payload = self.body_json()
        except (ValueError, json.JSONDecodeError) as exc:
            return self.send_json(400, {"error": str(exc) or "Invalid JSON"})
        if route == "/api/memories":
            person = str(payload.get("person", "")).strip()[:80]
            title = str(payload.get("title", "")).strip()[:120]
            story = str(payload.get("story", "")).strip()[:5000]
            details = str(payload.get("details", "")).strip()[:1000]
            if not person or not title or not story:
                return self.send_json(400, {"error": "Add a name, a title, and a story first."})
            entry = {"id": os.urandom(8).hex(), "person": person, "title": title,
                     "story": story, "details": details, "date": date.today().isoformat(),
                     "created_at": datetime.now(timezone.utc).isoformat(), "sample": False}
            with LOCK:
                items = read_memories()
                items.insert(0, entry)
                write_memories(items)
            return self.send_json(201, entry)
        if route == "/api/illuminate":
            ids = set(payload.get("ids", []))
            with LOCK:
                chosen = [m for m in read_memories() if m["id"] in ids]
            if not chosen:
                return self.send_json(400, {"error": "Choose at least one memory for the lantern."})
            sources = "\n\n".join(
                f"[{i + 1}] {m['person']} — {m['title']}\nStory: {m['story']}\nDetails: {m.get('details', '')}"
                for i, m in enumerate(chosen)
            )
            system_prompt = (
                "Write a concise remembrance using only concrete facts from the provided family notes. "
                "Do not infer emotions, relationships, quotations, importance, or biographical details. "
                "Do not write as if you are the person who died. For a single note, use 2–4 sentences; "
                "for several notes, use at most 6 sentences. End with SOURCES: and the bracketed note "
                "numbers used."
            )
            req = urllib.request.Request("http://127.0.0.1:11434/api/chat", data=json.dumps({
                "model": "gemma4:latest",
                "messages": [{"role": "system", "content": system_prompt},
                             {"role": "user", "content": sources}],
                "think": False, "stream": False,
                "options": {"temperature": 0.7, "num_predict": 300},
            }).encode(), headers={"Content-Type": "application/json"}, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=120) as response:
                    result = json.load(response)
                    output = result.get("message", {}).get("content", "").strip()
            except urllib.error.HTTPError as exc:
                if exc.code == 404:
                    return self.send_json(503, {"error": "Gemma isn't installed yet. Run: ollama pull gemma4:latest"})
                return self.send_json(502, {"error": f"Ollama returned HTTP {exc.code}. Is `ollama serve` running?"})
            except (OSError, TimeoutError):
                return self.send_json(503, {"error": "Can't reach local Ollama. Start it with `ollama serve`, then try again."})
            if not output:
                return self.send_json(502, {"error": "Gemma returned an empty remembrance. Try again with a shorter note."})
            return self.send_json(200, {"text": output, "sources": [{"id": m["id"], "title": m["title"], "person": m["person"]} for m in chosen]})
        return self.send_json(404, {"error": "Not found"})

    def do_PUT(self):
        item_id = urlparse(self.path).path.removeprefix("/api/memories/")
        if not item_id or "/" in item_id:
            return self.send_json(404, {"error": "Not found"})
        try:
            payload = self.body_json()
        except (ValueError, json.JSONDecodeError) as exc:
            return self.send_json(400, {"error": str(exc) or "Invalid JSON"})
        fields = {key: str(payload.get(key, "")).strip() for key in ("person", "title", "story", "details")}
        for key, limit in (("person", 80), ("title", 120), ("story", 5000), ("details", 1000)):
            fields[key] = fields[key][:limit]
        if not fields["person"] or not fields["title"] or not fields["story"]:
            return self.send_json(400, {"error": "Add a name, a title, and a story first."})
        with LOCK:
            items = read_memories()
            target = next((m for m in items if m["id"] == item_id), None)
            if target is None:
                return self.send_json(404, {"error": "Memory not found"})
            target.update(fields)
            write_memories(items)
        return self.send_json(200, target)

    def do_DELETE(self):
        item_id = urlparse(self.path).path.removeprefix("/api/memories/")
        if not item_id or "/" in item_id:
            return self.send_json(404, {"error": "Not found"})
        with LOCK:
            items = read_memories()
            filtered = [m for m in items if m["id"] != item_id]
            if len(items) == len(filtered):
                return self.send_json(404, {"error": "Memory not found"})
            write_memories(filtered)
        return self.send_json(200, {"deleted": item_id})


if __name__ == "__main__":
    host, port = "127.0.0.1", 8000
    print(f"Memory Lantern is ready at http://{host}:{port}")
    print("Press Ctrl+C to stop. Your notes stay in data/memories.json.")
    ThreadingHTTPServer((host, port), Handler).serve_forever()
