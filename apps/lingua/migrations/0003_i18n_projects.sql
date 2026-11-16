DROP TABLE files;

CREATE TABLE files (
    project    TEXT NOT NULL,
    path       TEXT NOT NULL,
    kind       TEXT NOT NULL,
    locale     TEXT NOT NULL,
    file       TEXT NOT NULL,
    blob_sha   TEXT NOT NULL,
    body       TEXT NOT NULL,
    PRIMARY KEY (project, path)
);

CREATE INDEX files_by_locale ON files(project, locale);

UPDATE projects SET head_sha = NULL, tree_sha = NULL;

ALTER TABLE edits RENAME COLUMN namespace TO file;

CREATE TABLE confirms (
    project     TEXT NOT NULL,
    user_id     INTEGER NOT NULL,
    locale      TEXT NOT NULL,
    key         TEXT NOT NULL,
    proposed    INTEGER NOT NULL DEFAULT 0,
    updated_at  INTEGER NOT NULL,
    PRIMARY KEY (project, user_id, locale, key)
);

CREATE TABLE starts (
    project     TEXT NOT NULL,
    user_id     INTEGER NOT NULL,
    locale      TEXT NOT NULL,
    proposed    INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (project, user_id, locale)
);
