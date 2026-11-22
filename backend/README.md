# Connecting the Dots — backend

FastAPI service that stores PDFs, splits them into sections, and finds related
passages across the library. Gemini adds semantic search, AI ranking, insights
and podcast voices. Without a key, the app still works, using keyword search
and the browser's speech synthesis.

## Run it

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
cp .env.example .env          # optionally add GEMINI_API_KEY
.venv/bin/python -m app       # http://127.0.0.1:8000, API docs at /docs
```

Run the tests and linting (no API key or network needed):

```bash
.venv/bin/python -m pytest
.venv/bin/ruff check app tests && .venv/bin/ruff format --check app tests
```

## What works with and without a key

| Feature | No `GEMINI_API_KEY` | With `GEMINI_API_KEY` |
|---|---|---|
| Upload, library, PDF serving | ✅ | ✅ |
| Connections | TF-IDF keyword matches | Embedding search + one Gemini call that labels each match *supports / contradicts / example / related* with a reason |
| Insights | 503 with an explanation | ✅ |
| Podcast script | Simple template from the matched passages | Gemini-written two-host dialogue |
| Podcast audio | Browser speech (`tts: "browser"`) | Gemini multi-speaker TTS (WAV). Falls back to the browser if TTS fails or is disabled |

If a Gemini call fails (invalid key, quota, network), each feature degrades to
the keyword or template path and returns a `warning` or `tts_error` explaining
why. Nothing crashes.

## Layout

```
app/
  main.py            app factory, error handlers, optional static frontend
  config.py          settings from env / .env
  db.py              SQLite: documents + chunks (+ embeddings as float32 blobs)
  schemas.py         request/response models (served at /docs)
  api/               HTTP routes (documents, analysis)
  services/
    pdf_processing.py  headings, outline, section-aware chunks, highlight rects
    indexer.py         background parse → chunk → embed pipeline
    search.py          semantic + TF-IDF retrieval
    analysis.py        connections, insights, podcast
    ai.py              Gemini wrapper (the only module importing the SDK)
tests/               pytest suite with generated PDFs and a fake Gemini
```

Data (SQLite DB, uploaded PDFs, generated audio) lives in `DATA_DIR`
(default `backend/data/`, git-ignored). Uploaded PDFs are named by content
hash, so the same file is never stored or indexed twice.
