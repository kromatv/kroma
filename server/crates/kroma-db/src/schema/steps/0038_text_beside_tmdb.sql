-- The TMDB id the `.nfo` file names for its title (LIB-85). Forgetting when
-- each file was modified reads every one again at the next scan, so the files
-- read before give their id too.
ALTER TABLE text_beside ADD COLUMN tmdb_id INTEGER;
UPDATE text_beside SET modified = NULL WHERE modified IS NOT NULL;
