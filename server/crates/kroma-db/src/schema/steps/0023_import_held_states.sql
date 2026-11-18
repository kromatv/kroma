CREATE TABLE import_held_states (
    abs_path    TEXT NOT NULL,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    watched_at  INTEGER,
    position_ms INTEGER,
    duration_ms INTEGER,
    resumed_at  INTEGER,
    listed      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (abs_path, user_id)
) WITHOUT ROWID;
