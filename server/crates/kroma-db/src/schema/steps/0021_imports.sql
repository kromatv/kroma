CREATE TABLE import_servers (
    id       TEXT PRIMARY KEY,
    importer TEXT NOT NULL,
    server   TEXT NOT NULL,
    name     TEXT NOT NULL DEFAULT '',
    UNIQUE (importer, server)
);

CREATE TABLE imports (
    id          TEXT PRIMARY KEY,
    server_id   TEXT NOT NULL REFERENCES import_servers(id) ON DELETE CASCADE,
    sign_in     TEXT,
    selection   TEXT NOT NULL,
    started_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
    status      TEXT NOT NULL,
    run_id      TEXT,
    created_at  INTEGER NOT NULL,
    started_at  INTEGER,
    finished_at INTEGER,
    report      TEXT NOT NULL DEFAULT '{}',
    failure     TEXT
);
CREATE INDEX idx_imports_created ON imports(created_at DESC);

CREATE TABLE import_records (
    server_id   TEXT NOT NULL REFERENCES import_servers(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    scope       TEXT NOT NULL DEFAULT '',
    source_id   TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    target      TEXT,
    import_id   TEXT NOT NULL,
    PRIMARY KEY (server_id, kind, scope, source_id)
) WITHOUT ROWID;

CREATE TABLE import_titles (
    server_id TEXT NOT NULL REFERENCES import_servers(id) ON DELETE CASCADE,
    title_id  TEXT NOT NULL,
    described TEXT NOT NULL,
    PRIMARY KEY (server_id, title_id)
) WITHOUT ROWID;

CREATE TABLE import_unmatched (
    import_id TEXT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
    title_id  TEXT NOT NULL,
    PRIMARY KEY (import_id, title_id)
) WITHOUT ROWID;

CREATE TABLE import_passes (
    server_id    TEXT NOT NULL REFERENCES import_servers(id) ON DELETE CASCADE,
    pass         TEXT NOT NULL,
    read_at_secs INTEGER NOT NULL,
    PRIMARY KEY (server_id, pass)
) WITHOUT ROWID;
