-- The tagline a `.nfo` file gives in `<tagline>` (LIB-95). Forgetting when
-- each file was modified reads every one again at the next scan, so the files
-- read before give their tagline too.
UPDATE text_beside SET modified = NULL WHERE modified IS NOT NULL;
