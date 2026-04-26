# API Documentation

Base URL: `http://localhost:3001`

All responses follow this format:

```json
{
  "success": true,
  "data": {}
}
```

---

## Health

### `GET /health`

Check if the backend is running.

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2026-04-26T12:00:00.000Z"
}
```

---

## Sessions

### `GET /api/sessions`

List all recording sessions, most recent first.

**Query params:**

- `limit` (default: 20)
- `offset` (default: 0)

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Team Standup",
      "started_at": "2026-04-26T10:00:00Z",
      "ended_at": "2026-04-26T10:30:00Z",
      "status": "completed",
      "speaker_count": 3,
      "total_duration_ms": 1800000
    }
  ],
  "count": 1
}
```

---

### `GET /api/sessions/:id`

Get a single session by ID.

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Team Standup",
    "status": "completed",
    "speaker_count": 3
  }
}
```

---

## Transcripts

### `GET /api/transcripts/:sessionId`

Get full transcript with all utterances for a session.

**Response:**

```json
{
  "success": true,
  "data": {
    "session": { "id": "uuid", "title": "..." },
    "utterances": [
      {
        "id": "uuid",
        "session_id": "uuid",
        "speaker": "Speaker A",
        "text": "Hello everyone, let's get started.",
        "start_ms": 1200,
        "end_ms": 4500,
        "confidence": 0.97
      }
    ]
  }
}
```

---

### `GET /api/transcripts/:sessionId/export`

Download the full transcript as a plain text file.

**Response:** `Content-Type: text/plain` file download.

**Example output:**

```
Meeting Transcript
Session: abc123...
Date: 2026-04-26T10:00:00Z

[00:00:01] Speaker A: Hello everyone, let's get started.
[00:00:05] Speaker B: Thanks for joining. I wanted to discuss...
[00:00:12] Speaker A: Sure, go ahead.
```

---

## WebSocket Protocol

Connect to: `ws://localhost:3001`

### Client → Server messages

**Start a session:**

```json
{ "type": "start_session", "title": "My Meeting" }
```

**Stop a session:**

```json
{ "type": "stop_session" }
```

**Send audio:** Binary WebM/Opus audio chunks (sent every 250ms)

---

### Server → Client messages

```json
{ "type": "connected", "message": "..." }
{ "type": "session_started", "sessionId": "uuid" }
{ "type": "processing", "message": "Transcribing audio..." }
{ "type": "transcript_complete", "sessionId": "uuid", "utterances": [...] }
{ "type": "error", "message": "..." }
```
