-- The studios a `.nfo` file names in `<studio>` (LIB-100). Forgetting when
-- each file was modified reads every one again at the next scan, so the files
-- read before give their studios too.
UPDATE text_beside SET modified = NULL WHERE modified IS NOT NULL;
