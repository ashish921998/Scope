CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  platform TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  participants_json TEXT NOT NULL DEFAULT '[]',
  transcript_json TEXT NOT NULL DEFAULT '[]',
  notes_json TEXT,
  calendar_event_id TEXT,
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);
CREATE INDEX IF NOT EXISTS idx_meetings_started_at ON meetings(started_at);
