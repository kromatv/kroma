-- The IMDb and TheTVDB ids a `.nfo` file names for its title, which TMDB is
-- asked about when the file names no TMDB id (LIB-92). Forgetting when each
-- file was modified reads every one again at the next scan, so the files read
-- before give their ids too.
ALTER TABLE text_beside ADD COLUMN imdb_id TEXT;
ALTER TABLE text_beside ADD COLUMN tvdb_id INTEGER;
UPDATE text_beside SET modified = NULL WHERE modified IS NOT NULL;
