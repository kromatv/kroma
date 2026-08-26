-- One row per install that has opted in, upserted by its own heartbeat.
-- `id` is the only key: it is an opaque random token the install minted for
-- itself, is never joined to an address, and is the whole authorisation to
-- write this row.
CREATE TABLE IF NOT EXISTS instances (
    id              TEXT PRIMARY KEY,
    first_seen      INTEGER NOT NULL,
    last_seen       INTEGER NOT NULL,
    version         TEXT NOT NULL,
    commit_hash     TEXT NOT NULL,
    target          TEXT NOT NULL,
    install         TEXT NOT NULL,
    country         TEXT,
    clients_tv      INTEGER NOT NULL DEFAULT 0,
    clients_mobile  INTEGER NOT NULL DEFAULT 0,
    clients_desktop INTEGER NOT NULL DEFAULT 0,
    locales         TEXT NOT NULL DEFAULT '[]',
    modules         TEXT NOT NULL DEFAULT '[]',
    users_bucket    TEXT NOT NULL,
    titles_bucket   TEXT NOT NULL,
    flagged         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS instances_last_seen ON instances(last_seen);
CREATE INDEX IF NOT EXISTS instances_first_seen ON instances(first_seen);

-- The published time series, so the page keeps its history after a raw row is
-- pruned.
CREATE TABLE IF NOT EXISTS daily (
    day       TEXT PRIMARY KEY,
    instances INTEGER NOT NULL,
    clients   INTEGER NOT NULL
);
