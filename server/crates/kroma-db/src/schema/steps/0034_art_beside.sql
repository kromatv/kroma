-- The pictures a scan found beside each title's files, the poster and the
-- backdrop that come before fetched art (MEDIA-48), and the cached name each
-- one is served under.
CREATE TABLE art_beside (
    subject_kind TEXT NOT NULL,
    subject_id   TEXT NOT NULL,
    role         TEXT NOT NULL,
    library      TEXT NOT NULL,
    picture      TEXT NOT NULL,
    url          TEXT NOT NULL,
    PRIMARY KEY (subject_kind, subject_id, role)
);
CREATE INDEX art_beside_url ON art_beside (url);
