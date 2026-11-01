ALTER TABLE notifications ADD COLUMN module_type TEXT;

-- A NULL switch follows the type's category.
CREATE TABLE notification_type_prefs (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type    TEXT NOT NULL,
    in_app  INTEGER,
    push    INTEGER,
    PRIMARY KEY (user_id, type)
) WITHOUT ROWID;
