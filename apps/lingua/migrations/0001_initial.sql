CREATE TABLE projects (
    id               TEXT PRIMARY KEY,
    installation_id  INTEGER NOT NULL,
    branch           TEXT NOT NULL,
    config           TEXT,
    config_error     TEXT,
    head_sha         TEXT,
    tree_sha         TEXT,
    synced_at        INTEGER
);

CREATE TABLE files (
    project    TEXT NOT NULL,
    path       TEXT NOT NULL,
    catalog    INTEGER NOT NULL,
    locale     TEXT NOT NULL,
    namespace  TEXT NOT NULL,
    blob_sha   TEXT NOT NULL,
    body       TEXT NOT NULL,
    PRIMARY KEY (project, path)
);

CREATE INDEX files_by_locale ON files(project, locale);

CREATE TABLE users (
    id          INTEGER PRIMARY KEY,
    login       TEXT NOT NULL,
    name        TEXT,
    avatar_url  TEXT,
    seen_at     INTEGER NOT NULL
);

CREATE TABLE sessions (
    hash        TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL
);

CREATE INDEX sessions_by_expiry ON sessions(expires_at);

CREATE TABLE edits (
    project     TEXT NOT NULL,
    user_id     INTEGER NOT NULL,
    locale      TEXT NOT NULL,
    namespace   TEXT NOT NULL,
    key         TEXT NOT NULL,
    value       TEXT NOT NULL,
    proposed    INTEGER NOT NULL DEFAULT 0,
    updated_at  INTEGER NOT NULL,
    PRIMARY KEY (project, user_id, locale, key)
);

CREATE TABLE proposals (
    project     TEXT NOT NULL,
    user_id     INTEGER NOT NULL,
    locale      TEXT NOT NULL,
    branch      TEXT NOT NULL,
    pr_number   INTEGER NOT NULL,
    pr_url      TEXT NOT NULL,
    head_sha    TEXT NOT NULL,
    updated_at  INTEGER NOT NULL,
    PRIMARY KEY (project, user_id, locale)
);

CREATE UNIQUE INDEX proposals_by_branch ON proposals(project, branch);
