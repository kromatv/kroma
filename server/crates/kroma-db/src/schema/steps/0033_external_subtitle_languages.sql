-- The languages of the text subtitle files a scan found beside each video, as a
-- JSON array of codes, so the subtitle filter counts them (BROWSE-65).
ALTER TABLE files ADD COLUMN external_subtitle_languages TEXT NOT NULL DEFAULT '[]';
