CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    file_name TEXT NOT NULL,
    participant_self TEXT NOT NULL,
    participants_json TEXT NOT NULL,
    message_count INTEGER DEFAULT 0,
    imported_at TEXT NOT NULL,
    status TEXT DEFAULT 'imported'
);

CREATE TABLE IF NOT EXISTS training_runs (
    id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    base_model TEXT NOT NULL,
    config_json TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    started_at TEXT,
    completed_at TEXT,
    metrics_json TEXT,
    output_path TEXT,
    error TEXT
);

CREATE TABLE IF NOT EXISTS models (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    mode TEXT NOT NULL,
    base_model TEXT NOT NULL,
    training_run_id TEXT REFERENCES training_runs(id),
    gguf_path TEXT,
    adapter_path TEXT,
    created_at TEXT NOT NULL,
    is_loaded INTEGER DEFAULT 0,
    config_json TEXT
);

CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    model_id TEXT REFERENCES models(id),
    mode TEXT NOT NULL,
    created_at TEXT NOT NULL,
    title TEXT
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES chat_sessions(id),
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
);
