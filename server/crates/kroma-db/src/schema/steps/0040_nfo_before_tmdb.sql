-- Every text written for a title, in the order each comes before the
-- provider's: what a person wrote by hand first, then the `.nfo` file's,
-- whether or not the provider matched the title (LIB-84), as Jellyfin and
-- Kodi put a local file ahead of TMDB.
DROP VIEW title_texts;
CREATE VIEW title_texts AS
    SELECT subject_kind, subject_id, edit, 0 AS precedence FROM text_beside
    UNION ALL
    SELECT subject_kind, subject_id, edit, 1 AS precedence FROM title_edits;
