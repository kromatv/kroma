CREATE TABLE upgrade_tasks (
    name       TEXT PRIMARY KEY,
    done_at    INTEGER,
    attempts   INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
);
