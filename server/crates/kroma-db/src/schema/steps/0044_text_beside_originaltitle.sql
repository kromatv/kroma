-- The original title a `.nfo` file gives in `<originaltitle>` (LIB-94).
-- Forgetting when each file was modified reads every one again at the next
-- scan, so the files read before give their original title too.
UPDATE text_beside SET modified = NULL WHERE modified IS NOT NULL;
