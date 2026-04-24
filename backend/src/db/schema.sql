-- Sessions table: one row per meeting recording
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  speaker_count INTEGER DEFAULT 0,
  total_duration_ms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Utterances table: one row per spoken segment with speaker label
CREATE TABLE IF NOT EXISTS utterances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  speaker VARCHAR(50) NOT NULL,
  text TEXT NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  confidence FLOAT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast transcript retrieval by session
CREATE INDEX IF NOT EXISTS idx_utterances_session_id ON utterances(session_id);
CREATE INDEX IF NOT EXISTS idx_utterances_start_ms ON utterances(session_id, start_ms);

-- Sessions index for listing recent sessions
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at DESC);