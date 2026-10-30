-- `subscription_id` carries no foreign key on purpose: a record of a device
-- that is gone is exactly what this table is for, and a cascade would delete it
-- with the endpoint it describes.
CREATE TABLE notification_deliveries (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_id TEXT,
    subscription_id TEXT,
    device          TEXT,
    transport       TEXT NOT NULL,
    status          TEXT NOT NULL,
    error           TEXT,
    created_at      INTEGER NOT NULL
);
CREATE INDEX idx_notification_deliveries_user
    ON notification_deliveries(user_id, created_at DESC);
CREATE INDEX idx_notification_deliveries_at
    ON notification_deliveries(created_at);
