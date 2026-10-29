ALTER TABLE notifications ADD COLUMN subject_kind TEXT;
ALTER TABLE notifications ADD COLUMN subject_id TEXT;
ALTER TABLE notifications ADD COLUMN actor_id TEXT;
ALTER TABLE notifications ADD COLUMN data TEXT;

CREATE INDEX idx_notifications_subject
    ON notifications(user_id, subject_kind, subject_id)
    WHERE subject_kind IS NOT NULL;
