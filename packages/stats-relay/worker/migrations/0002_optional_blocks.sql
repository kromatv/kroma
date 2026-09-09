-- Schema 2: a detail block an operator switched off is absent, and absent is
-- NULL. The columns were NOT NULL, and SQLite cannot drop that in place, so the
-- table is rebuilt around them. `daily` is untouched: it carries no per-install
-- column and its shape has not moved.
--
-- Rows survive the rebuild. A row written under schema 1 reported every block,
-- so its values carry over as they stand and read back as "this server told us",
-- which is what they were.

CREATE TABLE instances_v2 (
    id              TEXT PRIMARY KEY,
    first_seen      INTEGER NOT NULL,
    last_seen       INTEGER NOT NULL,
    version         TEXT NOT NULL,
    commit_hash     TEXT NOT NULL,
    target          TEXT NOT NULL,
    install         TEXT NOT NULL,
    country         TEXT,
    clients_tv      INTEGER,
    clients_mobile  INTEGER,
    clients_desktop INTEGER,
    locales         TEXT,
    modules         TEXT,
    users_bucket    TEXT,
    titles_bucket   TEXT,
    flagged         INTEGER NOT NULL DEFAULT 0
);

INSERT INTO instances_v2
    SELECT id, first_seen, last_seen, version, commit_hash, target, install,
           country, clients_tv, clients_mobile, clients_desktop, locales,
           modules, users_bucket, titles_bucket, flagged
      FROM instances;

DROP TABLE instances;

ALTER TABLE instances_v2 RENAME TO instances;

CREATE INDEX IF NOT EXISTS instances_last_seen ON instances(last_seen);
CREATE INDEX IF NOT EXISTS instances_first_seen ON instances(first_seen);
