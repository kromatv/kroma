CREATE TABLE profile_title_rules (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title_id   TEXT NOT NULL,
    rule       TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, title_id)
);
