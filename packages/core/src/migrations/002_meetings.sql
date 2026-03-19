CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  attendees_json TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_provider_event
  ON calendar_events(provider, provider_event_id);

CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  consent_state TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  calendar_event_id TEXT,
  transcription_ref_json TEXT,
  capture_source_json TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(calendar_event_id) REFERENCES calendar_events(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);
CREATE INDEX IF NOT EXISTS idx_meetings_calendar_event_id ON meetings(calendar_event_id);
CREATE INDEX IF NOT EXISTS idx_meetings_created_at ON meetings(created_at);

CREATE TABLE IF NOT EXISTS meeting_notes (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  content TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meeting_notes_meeting_id ON meeting_notes(meeting_id, created_at DESC);
