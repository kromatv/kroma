-- The sort title a `.nfo` file gives in `<sorttitle>` (LIB-88). Forgetting
-- when each file was modified reads every one again at the next scan, so the
-- files read before give their sort title too.
UPDATE text_beside SET modified = NULL WHERE modified IS NOT NULL;
