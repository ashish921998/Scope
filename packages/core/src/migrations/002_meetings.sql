CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  transcript_json TEXT NOT NULL,
  notes_json TEXT
);
