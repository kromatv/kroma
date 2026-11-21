ALTER TABLE play_history ADD COLUMN import_server_id TEXT;

CREATE TABLE import_held_plays (
    id          TEXT PRIMARY KEY,
    server_id   TEXT NOT NULL REFERENCES import_servers(id) ON DELETE CASCADE,
    abs_path    TEXT NOT NULL,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    played_at   INTEGER NOT NULL,
    duration_ms INTEGER
) WITHOUT ROWID;
