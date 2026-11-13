CREATE TABLE identities (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    issuer     TEXT NOT NULL,
    subject    TEXT NOT NULL,
    label      TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_used  TEXT,
    UNIQUE (issuer, subject)
);
CREATE INDEX idx_identities_user ON identities(user_id);

CREATE TABLE join_requests (
    id         TEXT PRIMARY KEY,
    issuer     TEXT NOT NULL,
    subject    TEXT NOT NULL,
    username   TEXT NOT NULL,
    email      TEXT NOT NULL,
    name       TEXT,
    blocked    INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    UNIQUE (issuer, subject)
);
