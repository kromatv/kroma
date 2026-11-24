-- The poster and the backdrop an admin chose for a title (MEDIA-50), and every
-- picture kept for a title in the order they come before fetched art: the
-- chosen one first, then the one beside its files.
CREATE TABLE art_chosen (
    subject_kind TEXT NOT NULL,
    subject_id   TEXT NOT NULL,
    role         TEXT NOT NULL,
    url          TEXT NOT NULL,
    chosen_at    INTEGER NOT NULL,
    PRIMARY KEY (subject_kind, subject_id, role)
);
CREATE VIEW art_kept AS
    SELECT subject_kind, subject_id, role, url, 0 AS precedence FROM art_beside
    UNION ALL
    SELECT subject_kind, subject_id, role, url, 1 AS precedence FROM art_chosen;
