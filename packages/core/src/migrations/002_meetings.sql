CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  consent_accepted INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  transcript_json TEXT NOT NULL,
  notes_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);
CREATE INDEX IF NOT EXISTS idx_meetings_started_at ON meetings(started_at);
