ALTER TABLE projects DROP COLUMN installation_id;
ALTER TABLE projects ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN branch_sha TEXT;
ALTER TABLE projects ADD COLUMN etag TEXT;
ALTER TABLE projects ADD COLUMN files_done INTEGER;
ALTER TABLE projects ADD COLUMN files_total INTEGER;
ALTER TABLE projects ADD COLUMN sync_error TEXT;
ALTER TABLE projects ADD COLUMN checked_at INTEGER;
ALTER TABLE projects ADD COLUMN syncing_until INTEGER;

DROP TABLE setup_codes;
