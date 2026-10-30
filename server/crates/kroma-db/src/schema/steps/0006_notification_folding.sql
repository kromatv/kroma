ALTER TABLE notifications ADD COLUMN group_key TEXT;
ALTER TABLE notifications ADD COLUMN count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE notifications ADD COLUMN updated_at INTEGER;
ALTER TABLE notifications ADD COLUMN pushed_at INTEGER;

CREATE INDEX idx_notifications_group
    ON notifications(user_id, group_key)
    WHERE group_key IS NOT NULL;
