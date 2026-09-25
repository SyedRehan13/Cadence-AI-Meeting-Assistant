# Cadence

Cadence turns meeting transcripts or recordings into structured meeting minutes and reviewable action items. The frontend is React/Vite; the backend is FastAPI. Groq Whisper transcribes audio and video, and Gemini analyzes the transcript.

## Local setup

Install Python 3.13 or a supported earlier version, Node.js/npm, and FFmpeg on your `PATH`. Cadence uses a PostgreSQL database and private Supabase Storage for recordings.

1. Copy `backend/.env.example` to `backend/.env`. Enter your own database, Supabase, Gemini, Groq, Google web client, and JWT values. Keep this file private.
2. In `backend`, install dependencies with `python -m pip install -r requirements.txt` and run `uvicorn main:app --reload --port 8000`.
3. In a second terminal, run `npm ci` and `npm run dev` from `frontend`. Open the URL Vite prints, normally `http://localhost:5173`.

The backend creates or updates its tables when it starts. Existing meeting data is retained. FFmpeg is needed when an uploaded recording requires conversion or chunking. Text and text-based PDF uploads do not use Groq; scanned PDFs need OCR before upload.

## Configuration

The frontend defaults to `http://127.0.0.1:8000`. To use a different backend URL, copy `frontend/.env.example` to `frontend/.env` and set `VITE_API_BASE_URL`. For a different frontend origin, set comma-separated `CORS_ORIGINS` in `backend/.env`. Restart the affected server after changing its environment file. API keys and Supabase service credentials belong only in `backend/.env`.

## Checks

- Backend: from `backend`, run `python -m unittest discover -s tests`.
- Frontend: from `frontend`, run `npm run build` and `node --test tests/api-session.test.mjs`.

`cadencedata/`, `.tmp/`, the local `ffmpeg/` bundle, environment files, generated output, and installed dependencies are ignored by the root `.gitignore`. Share only your own credentials through a private channel; recipients should create their own `.env` files.
