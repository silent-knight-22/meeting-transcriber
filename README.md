# Meeting Transcriber

A production-grade Chrome Extension that captures meeting audio from Google Meet, Zoom, and Microsoft Teams, performs real-time speaker-separated transcription using AssemblyAI, and stores structured transcripts in PostgreSQL — all orchestrated via Docker Compose.

---

## Architecture

```
Chrome Extension (Manifest V3)
  ├── content.js        → Detects active meeting tab
  ├── background.js     → Captures tab audio, manages WebSocket
  └── popup.js/html     → Live transcript UI, start/stop controls
          │
          │  WebSocket (binary audio chunks, 250ms intervals)
          ▼
Node.js Backend (Express + ws)
  ├── sessionService.js → Manages recording sessions in memory
  ├── assemblyai.js     → AssemblyAI SDK integration
  ├── routes/           → REST API for sessions and transcripts
  └── db/               → PostgreSQL queries
          │
          ├──▶ AssemblyAI API  (speaker diarization + STT)
          └──▶ PostgreSQL      (sessions, utterances tables)
```

---

## Features

- Detects active Google Meet / Zoom / Teams tabs automatically
- One-click Start/Stop recording from extension popup
- Captures browser tab audio via Chrome `tabCapture` API
- Streams audio chunks over WebSocket to Node.js backend
- Speaker diarization via AssemblyAI — labels each speaker (Speaker A, B, C...)
- Live transcript pushed back to extension popup via WebSocket
- Full transcript stored in PostgreSQL with timestamps per utterance
- Export transcript as timestamped `.txt` file
- View all past sessions via REST API
- Docker Compose — single command to start backend + database
- Clean modular architecture with error handling and structured logging

---

## Tech Stack

| Layer            | Technology                                         |
| ---------------- | -------------------------------------------------- |
| Chrome Extension | Manifest V3, tabCapture API, WebSocket, Vanilla JS |
| Backend          | Node.js, Express, ws (WebSocket)                   |
| Transcription    | AssemblyAI (speaker diarization + STT)             |
| Database         | PostgreSQL 15                                      |
| DevOps           | Docker, Docker Compose                             |
| Language         | JavaScript (ES2022)                                |

---

## Project Structure

```
meeting-transcriber/
├── backend/
│   ├── src/
│   │   ├── config/         # env + db connection pool
│   │   ├── services/       # AssemblyAI + session management
│   │   ├── routes/         # REST API routes
│   │   ├── db/             # SQL schema + query functions
│   │   ├── middleware/      # Error handler
│   │   ├── utils/          # Logger
│   │   └── index.js        # Express + WebSocket server entry
│   └── Dockerfile
├── extension/
│   ├── src/
│   │   ├── background.js   # Service worker — audio capture + WS
│   │   ├── content.js      # Meeting tab detector
│   │   ├── popup.html/js/css # Extension UI
│   └── manifest.json
├── docs/
│   └── API.md
├── docker-compose.yml
└── .env.example
```

---

## Prerequisites

- Node.js 18+
- Docker Desktop
- AssemblyAI API key ([free tier at assemblyai.com](https://www.assemblyai.com))
- Google Chrome or Brave browser

---

## Setup & Installation

### 1. Clone the repository

```bash
git clone https://github.com/silent-knight-22/meeting-transcriber.git
cd meeting-transcriber
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and add your AssemblyAI API key:

```env
ASSEMBLYAI_API_KEY=your_key_here
```

### 3. Start the backend + database

```bash
docker compose up --build -d
```

This starts:

- PostgreSQL on port `5432` (auto-creates schema)
- Node.js backend on port `3001`

Verify both are healthy:

```bash
docker compose ps
curl http://localhost:3001/health
```

### 4. Load the Chrome Extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `extension/` folder
5. Pin the extension to your toolbar

---

## Usage

1. Start a Google Meet call
2. Click the **Meeting Transcriber** extension icon
3. Click **Start Recording**
4. Speak — the extension captures all tab audio
5. Click **Stop Recording**
6. Wait ~10–30 seconds for AssemblyAI to process
7. Transcript appears in the popup with speaker labels
8. Click **Export transcript** to download as `.txt`

---

## API Reference

See [docs/API.md](docs/API.md) for full API documentation.

### Quick reference

| Method | Endpoint                             | Description                     |
| ------ | ------------------------------------ | ------------------------------- |
| GET    | `/health`                            | Backend health check            |
| GET    | `/api/sessions`                      | List all recording sessions     |
| GET    | `/api/sessions/:id`                  | Get a specific session          |
| GET    | `/api/transcripts/:sessionId`        | Full transcript with utterances |
| GET    | `/api/transcripts/:sessionId/export` | Download as `.txt`              |

---

## Database Schema

```sql
sessions (
  id UUID PRIMARY KEY,
  title VARCHAR,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  status VARCHAR,          -- active | completed
  speaker_count INTEGER,
  total_duration_ms INTEGER
)

utterances (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES sessions,
  speaker VARCHAR,         -- Speaker A, Speaker B...
  text TEXT,
  start_ms INTEGER,
  end_ms INTEGER,
  confidence FLOAT
)
```

---

## Development

Run backend locally (without Docker):

```bash
cd backend
npm install
npm run dev       # nodemon — auto-restarts on changes
```

View live backend logs (Docker):

```bash
docker compose logs -f backend
```

Rebuild after code changes:

```bash
docker compose up --build -d
```

---

## Evaluation Criteria Coverage

| Criteria                  | Implementation                                                                  |
| ------------------------- | ------------------------------------------------------------------------------- |
| Architecture Design (20%) | Modular 3-layer architecture: Extension → WebSocket → Backend → AssemblyAI + DB |
| Chrome Extension (15%)    | Manifest V3, tabCapture, content script, background service worker, popup UI    |
| Speaker Separation (35%)  | AssemblyAI diarization — labels Speaker A/B/C with timestamps and confidence    |
| Code Quality (20%)        | Modular services, error middleware, structured logger, async/await throughout   |
| Database Design (5%)      | Normalized schema: sessions + utterances with indexes                           |
| Documentation (5%)        | README + API docs + architecture diagram                                        |

---

## License

MIT
