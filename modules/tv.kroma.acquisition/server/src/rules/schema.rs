/// The tables this module keeps in its own database, applied at boot.
pub const MIGRATIONS: &str = "
    -- The quality profiles, custom formats and size limits the admin edits.
    -- Bodies are the JSON the rules engine reads, so the editor and the
    -- decision speak one shape.
    CREATE TABLE IF NOT EXISTS quality_profiles (
        id         TEXT PRIMARY KEY,
        body       TEXT NOT NULL,
        updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS custom_formats (
        id         TEXT PRIMARY KEY,
        body       TEXT NOT NULL,
        position   INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );
    -- `sizes`, `default_profile`, and `seeded` once the defaults were written,
    -- so emptying a list never brings the defaults back.
    CREATE TABLE IF NOT EXISTS rule_settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    -- A title judged by another profile than the default.
    CREATE TABLE IF NOT EXISTS title_profiles (
        kind       TEXT NOT NULL,
        tmdb_id    INTEGER NOT NULL,
        profile_id TEXT NOT NULL,
        PRIMARY KEY (kind, tmdb_id)
    );
    -- The release name an import placed a file under, which says what its own
    -- name no longer does (source, group, languages).
    CREATE TABLE IF NOT EXISTS file_releases (
        abs_path      TEXT PRIMARY KEY,
        release_title TEXT NOT NULL,
        imported_at   INTEGER NOT NULL
    );
    -- A grab that adds a copy beside what is on disk rather than replacing it.
    CREATE TABLE IF NOT EXISTS beside_grabs (
        download_id TEXT PRIMARY KEY
    );
    -- Releases a title must not be grabbed again from: their download failed.
    CREATE TABLE IF NOT EXISTS blocklist (
        id            TEXT PRIMARY KEY,
        kind          TEXT NOT NULL,
        tmdb_id       INTEGER NOT NULL,
        release_title TEXT NOT NULL,
        info_hash     TEXT,
        indexer_id    TEXT,
        reason        TEXT NOT NULL,
        added_at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_blocklist_title ON blocklist(kind, tmdb_id);
    -- How far along a download was when a failure pass last looked, and when
    -- that number last moved: a stall is no progress for the limit, not a
    -- long download.
    CREATE TABLE IF NOT EXISTS download_progress (
        download_id TEXT PRIMARY KEY,
        progress    REAL NOT NULL,
        changed_at  INTEGER NOT NULL
    );
    -- Failed downloads already blocklisted and put back, so a pass handles each once.
    CREATE TABLE IF NOT EXISTS handled_failures (
        download_id TEXT PRIMARY KEY,
        handled_at  INTEGER NOT NULL
    );
    -- When each title was last searched for an upgrade, and how many of those
    -- searches found nothing, so upgrades back off like missing rows do.
    CREATE TABLE IF NOT EXISTS upgrade_searches (
        kind      TEXT NOT NULL,
        tmdb_id   INTEGER NOT NULL,
        last_at   INTEGER NOT NULL,
        attempts  INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (kind, tmdb_id)
    );
";
