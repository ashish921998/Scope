CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS interviews (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  consent_accepted INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  transcript_json TEXT NOT NULL,
  followups_json TEXT NOT NULL,
  debrief_json TEXT
);

CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  type TEXT NOT NULL,
  confidence REAL NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL,
  metadata_json TEXT,
  fingerprint TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_signals_source_ref ON signals(source, source_ref);
CREATE INDEX IF NOT EXISTS idx_signals_type ON signals(type);
CREATE INDEX IF NOT EXISTS idx_signals_created_at ON signals(created_at);

CREATE VIRTUAL TABLE IF NOT EXISTS signals_fts USING fts5(id UNINDEXED, summary, content='');

CREATE TABLE IF NOT EXISTS evidence_refs (
  id TEXT PRIMARY KEY,
  signal_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  uri TEXT NOT NULL,
  quote TEXT NOT NULL,
  timestamp_ms INTEGER,
  FOREIGN KEY(signal_id) REFERENCES signals(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS embeddings (
  id TEXT PRIMARY KEY,
  signal_id TEXT NOT NULL,
  vector_json TEXT NOT NULL,
  model TEXT NOT NULL,
  FOREIGN KEY(signal_id) REFERENCES signals(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS feature_candidates (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  signal_ids_json TEXT NOT NULL,
  cluster_score REAL NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dossiers (
  id TEXT PRIMARY KEY,
  feature_id TEXT NOT NULL,
  sections_json TEXT NOT NULL,
  citations_json TEXT NOT NULL,
  critic_notes_json TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
