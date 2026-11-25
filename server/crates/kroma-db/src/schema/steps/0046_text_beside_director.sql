-- The directors a `.nfo` file names in `<director>` (LIB-96). Forgetting when
-- each file was modified reads every one again at the next scan, so the files
-- read before give their directors too.
UPDATE text_beside SET modified = NULL WHERE modified IS NOT NULL;
