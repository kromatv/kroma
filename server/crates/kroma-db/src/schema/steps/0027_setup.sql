CREATE TABLE setup (
    id        INTEGER PRIMARY KEY CHECK (id = 1),
    owner     TEXT REFERENCES users(id) ON DELETE SET NULL,
    start     TEXT NOT NULL,
    step      TEXT NOT NULL,
    reached   TEXT NOT NULL,
    ended     INTEGER NOT NULL DEFAULT 0,
    done      TEXT NOT NULL DEFAULT '[]',
    dismissed TEXT NOT NULL DEFAULT '[]'
);
