ALTER TABLE notifications ADD COLUMN dedupe_key TEXT;

CREATE INDEX idx_notifications_dedupe
    ON notifications(user_id, dedupe_key)
    WHERE dedupe_key IS NOT NULL;
