-- The age rating a person writes for a title, or its `.nfo` file gives in
-- `<mpaa>` (LIB-97): what a person wrote, else what the file says. A profile's
-- ceiling weighs it in place of the provider's ratings. Forgetting when each
-- file was modified reads every one again at the next scan, so the files read
-- before give their rating too.
UPDATE text_beside SET modified = NULL WHERE modified IS NOT NULL;
DROP VIEW title_shown;
CREATE VIEW title_shown AS
    SELECT subject_kind, subject_id,
           COALESCE(MAX(CASE precedence WHEN 1 THEN json_extract(edit, '$.title') END),
                    MAX(CASE precedence WHEN 0 THEN json_extract(edit, '$.title') END)) AS title,
           COALESCE(MAX(CASE precedence WHEN 1 THEN json_extract(edit, '$.year') END),
                    MAX(CASE precedence WHEN 0 THEN json_extract(edit, '$.year') END)) AS year,
           COALESCE(MAX(CASE precedence WHEN 1 THEN json_extract(edit, '$.overview') END),
                    MAX(CASE precedence WHEN 0 THEN json_extract(edit, '$.overview') END)) AS overview,
           COALESCE(MAX(CASE precedence WHEN 1 THEN json_extract(edit, '$.genres') END),
                    MAX(CASE precedence WHEN 0 THEN json_extract(edit, '$.genres') END)) AS genres,
           COALESCE(MAX(CASE precedence WHEN 1 THEN json_extract(edit, '$.directors') END),
                    MAX(CASE precedence WHEN 0 THEN json_extract(edit, '$.directors') END)) AS directors,
           COALESCE(MAX(CASE precedence WHEN 1 THEN json_extract(edit, '$.contentRating') END),
                    MAX(CASE precedence WHEN 0 THEN json_extract(edit, '$.contentRating') END)) AS content_rating
      FROM title_texts
     GROUP BY subject_kind, subject_id;
