ALTER TABLE notifications ADD COLUMN seen_at INTEGER;
ALTER TABLE notifications ADD COLUMN interacted_at INTEGER;
ALTER TABLE notifications ADD COLUMN archived_at INTEGER;

UPDATE notifications SET seen_at = read_at WHERE read_at IS NOT NULL;

CREATE INDEX idx_notifications_unseen
    ON notifications(user_id) WHERE seen_at IS NULL AND archived_at IS NULL;
