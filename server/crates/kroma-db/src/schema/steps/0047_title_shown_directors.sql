-- The directors shown for each title a person or its `.nfo` file named
-- (LIB-96), beside its name, year, summary and genres: what a person wrote,
-- else what the file says. A person's page and the catalogue queries read
-- them in place of the provider's directors and creators.
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
                    MAX(CASE precedence WHEN 0 THEN json_extract(edit, '$.directors') END)) AS directors
      FROM title_texts
     GROUP BY subject_kind, subject_id;
