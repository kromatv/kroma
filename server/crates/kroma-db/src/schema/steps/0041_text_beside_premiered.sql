-- The release date a `.nfo` file gives in `<premiered>` (LIB-87). Forgetting
-- when each file was modified reads every one again at the next scan, so the
-- files read before give their date too.
UPDATE text_beside SET modified = NULL WHERE modified IS NOT NULL;
