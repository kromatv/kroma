CREATE TABLE import_identities (
    abs_path      TEXT PRIMARY KEY,
    server_id     TEXT NOT NULL REFERENCES import_servers(id) ON DELETE CASCADE,
    subject       TEXT NOT NULL,
    tmdb_id       INTEGER,
    imdb_id       TEXT,
    tvdb_id       INTEGER,
    found_tmdb_id INTEGER
) WITHOUT ROWID;
