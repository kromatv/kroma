CREATE TABLE users_new (
    id                TEXT PRIMARY KEY,
    email             TEXT UNIQUE COLLATE NOCASE,
    username          TEXT NOT NULL,
    password_hash     TEXT NOT NULL,
    avatar_url        TEXT,
    permissions       TEXT NOT NULL DEFAULT '["playback"]',
    created_at        TEXT NOT NULL,
    last_seen         TEXT,
    language          TEXT,
    pin_hash          TEXT,
    audio_language    TEXT,
    subtitle_language TEXT,
    email_verified_at TEXT,
    libraries         TEXT,
    whats_new_seen    TEXT,
    waiting           INTEGER NOT NULL DEFAULT 0,
    CHECK (email IS NOT NULL OR waiting = 1)
);

INSERT INTO users_new (
    id, email, username, password_hash, avatar_url, permissions, created_at, last_seen,
    language, pin_hash, audio_language, subtitle_language, email_verified_at, libraries,
    whats_new_seen
)
SELECT
    id, email, username, password_hash, avatar_url, permissions, created_at, last_seen,
    language, pin_hash, audio_language, subtitle_language, email_verified_at, libraries,
    whats_new_seen
FROM users ORDER BY rowid;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

ALTER TABLE invites ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX idx_invites_account ON invites(user_id)
    WHERE user_id IS NOT NULL AND used_at IS NULL;
