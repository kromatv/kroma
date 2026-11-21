CREATE TABLE watch_removals (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id    TEXT NOT NULL,
    kind       TEXT NOT NULL,
    removed_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, item_id, kind)
) WITHOUT ROWID;
