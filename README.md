# Memory Lantern 🕯️

**A private, local-first remembrance book.** Gather the small details that make someone unforgettable, then ask Gemma to shape only those saved memories into a gentle remembrance. The app runs on your computer; its local Ollama connection never sends memories to a hosted AI service.

## Run it

Requirements: Python 3.10+ and [Ollama](https://ollama.com/) with Gemma 4 for AI generation.

```powershell
ollama pull gemma4:latest
python app.py
```

Open <http://127.0.0.1:8000>. The app starts with a clearly labeled sample memory so you can explore before adding real stories. It works without Ollama in **Keepsake mode**: you can add, edit, search, and export memories; AI writing is available once the model is running.

## What it does

- Saves each memory as a dated, attributed note in `data/memories.json` on this computer.
- Uses Gemma 3 through Ollama's local API to draft a remembrance from the saved notes you select.
- Shows which saved notes grounded each generated paragraph; the model is instructed to leave gaps as gaps instead of inventing facts.
- Exports a printable, self-contained HTML keepsake. No account, cloud database, analytics, or remote AI API.
- Binds only to `127.0.0.1` so the app is not exposed to your network.

If Ollama is not already running as a background service, start it in another terminal with `ollama serve`. The browser interface and memory store work without Ollama; only remembrance generation needs the model.

## Privacy boundary

Memory Lantern itself sends no data over the internet. It uses system fonts, no analytics, and makes no external requests. The browser talks to the local Python server, which talks only to Ollama at `localhost:11434`. Ollama may need internet access once to download Gemma; after the model is installed, generation can work offline. You can inspect, edit, back up, or delete the plain JSON file yourself. Always review generated wording before sharing; an open model can still make mistakes.

## Design choice

This is a remembrance aid, not a simulation of a deceased person. It doesn't impersonate a voice or claim to speak for someone who died. The family keeps the source notes and can edit or delete them at any time.

## License

MIT. See [LICENSE](LICENSE).
