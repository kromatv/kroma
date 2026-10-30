ALTER TABLE notifications ADD COLUMN resolved_at INTEGER;
ALTER TABLE notifications ADD COLUMN resolved_by TEXT;

CREATE INDEX idx_notifications_resolve
    ON notifications(subject_kind, subject_id, event)
    WHERE subject_kind IS NOT NULL;
