-- What a person who manages the library wrote by hand about a film or a show
-- (LIB-83): a JSON object whose fields come before the provider's text, in
-- every language. A field it leaves out keeps following the provider.
CREATE TABLE title_edits (
    subject_kind TEXT NOT NULL,
    subject_id   TEXT NOT NULL,
    edit         TEXT NOT NULL,
    edited_at    INTEGER NOT NULL,
    PRIMARY KEY (subject_kind, subject_id)
);
