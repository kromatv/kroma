CREATE TABLE cast_devices (
        receiver_id   TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name          TEXT NOT NULL,
        platform      TEXT NOT NULL,
        mac           TEXT,
        address       TEXT,
        app_id        TEXT,
        beside_server INTEGER NOT NULL DEFAULT 0,
        seen_at       INTEGER NOT NULL
);
CREATE INDEX idx_cast_devices_user ON cast_devices(user_id);
