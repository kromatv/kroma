-- The name, year, summary and genres shown for each title a person or its
-- `.nfo` file wrote some of, field by field: what a person wrote, else what
-- the file says (LIB-83, LIB-84). The catalogue queries that sort and filter
-- in SQL read these over the scanned and fetched values (LIB-86).
CREATE VIEW title_shown AS
    SELECT subject_kind, subject_id,
           COALESCE(MAX(CASE precedence WHEN 1 THEN json_extract(edit, '$.title') END),
                    MAX(CASE precedence WHEN 0 THEN json_extract(edit, '$.title') END)) AS title,
           COALESCE(MAX(CASE precedence WHEN 1 THEN json_extract(edit, '$.year') END),
                    MAX(CASE precedence WHEN 0 THEN json_extract(edit, '$.year') END)) AS year,
           COALESCE(MAX(CASE precedence WHEN 1 THEN json_extract(edit, '$.overview') END),
                    MAX(CASE precedence WHEN 0 THEN json_extract(edit, '$.overview') END)) AS overview,
           COALESCE(MAX(CASE precedence WHEN 1 THEN json_extract(edit, '$.genres') END),
                    MAX(CASE precedence WHEN 0 THEN json_extract(edit, '$.genres') END)) AS genres
      FROM title_texts
     GROUP BY subject_kind, subject_id;
