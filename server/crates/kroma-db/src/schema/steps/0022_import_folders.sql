CREATE TABLE import_folders (
    server_id TEXT NOT NULL REFERENCES import_servers(id) ON DELETE CASCADE,
    folder    TEXT NOT NULL,
    here      TEXT NOT NULL,
    PRIMARY KEY (server_id, folder)
) WITHOUT ROWID;
