-- The cast a person writes for a title, or its `.nfo` file lists in `<actor>`
-- (LIB-98): what a person wrote, else what the file says, each actor a name
-- and the part they play. `actors`, since `cast` is a word of SQL. Forgetting
-- when each file was modified reads every one again at the next scan, so the
-- files read before give their cast too.
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
                    MAX(CASE precedence WHEN 0 THEN json_extract(edit, '$.contentRating') END)) AS content_rating,
           COALESCE(MAX(CASE precedence WHEN 1 THEN json_extract(edit, '$.cast') END),
                    MAX(CASE precedence WHEN 0 THEN json_extract(edit, '$.cast') END)) AS actors
      FROM title_texts
     GROUP BY subject_kind, subject_id;
