-- The text a scan read from the `.nfo` file beside each title's files, shown on
-- a title the provider did not match (LIB-84), and when the file was modified,
-- so a later scan reads again only the files that changed.
CREATE TABLE text_beside (
    subject_kind TEXT NOT NULL,
    subject_id   TEXT NOT NULL,
    library      TEXT NOT NULL,
    nfo          TEXT NOT NULL,
    modified     INTEGER,
    edit         TEXT NOT NULL,
    PRIMARY KEY (subject_kind, subject_id)
);
-- Every text written for a title, in the order each comes before the provider's:
-- what a person wrote by hand first, then the file's text, on a title the
-- provider did not match.
CREATE VIEW title_texts AS
    SELECT t.subject_kind, t.subject_id, t.edit, 0 AS precedence FROM text_beside t
     WHERE NOT EXISTS (SELECT 1 FROM metadata_core m
                        WHERE m.subject_kind = t.subject_kind
                          AND m.subject_id = t.subject_id
                          AND m.tmdb_id IS NOT NULL)
    UNION ALL
    SELECT subject_kind, subject_id, edit, 1 AS precedence FROM title_edits;
