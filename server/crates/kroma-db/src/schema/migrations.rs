//! Idempotent upgrades applied after the schema on every open.

// Idempotent column additions for databases created before a column existed.
// `ALTER TABLE … ADD COLUMN` errors with "duplicate column name" once the
// column is present, which we ignore.
pub(crate) const MIGRATIONS: &[&str] = &[
    // The downloads ledger predates its move into this schema; a database
    // that already carries it is missing the columns added since.
    "ALTER TABLE downloads ADD COLUMN upgrade INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE items ADD COLUMN metadata TEXT",
    "ALTER TABLE shows ADD COLUMN metadata TEXT",
    // Per-user permissions for accounts created before they existed.
    "ALTER TABLE users ADD COLUMN permissions TEXT NOT NULL DEFAULT '[\"playback\"]'",
    // Full per-file audio-track list (was a single representative track).
    "ALTER TABLE files ADD COLUMN audio_tracks TEXT NOT NULL DEFAULT '[]'",
    // Last-seen timestamp for the admin "Membres & partage" activity column.
    "ALTER TABLE users ADD COLUMN last_seen TEXT",
    // Per-account preferred UI locale ("fr" | "en"), synced across devices.
    "ALTER TABLE users ADD COLUMN language TEXT",
    // Optional profile-lock PIN (PBKDF2 hash, own salt). NULL = no PIN.
    "ALTER TABLE users ADD COLUMN pin_hash TEXT",
    // Per-account playback language preferences, synced across devices.
    // audio_language: preferred audio ISO code (NULL = no preference).
    // subtitle_language: preferred subtitle ISO code, or "off" (NULL = none).
    "ALTER TABLE users ADD COLUMN audio_language TEXT",
    "ALTER TABLE users ADD COLUMN subtitle_language TEXT",
    // Backstop the app-level username-uniqueness check against a check-then-
    // write race. Best-effort: on a legacy DB that already holds duplicate
    // usernames the index creation errors and is ignored (the app check still
    // covers the common case); fresh/clean DBs gain the hard guarantee.
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)",
    // `season_meta` shipped briefly with a `cast` column a reserved SQLite
    // keyword that breaks unquoted SELECT/INSERT. Rename to `casts`. Errors
    // ("no such column") once renamed / on fresh DBs, which we ignore.
    "ALTER TABLE season_meta RENAME COLUMN \"cast\" TO casts",
    // Keyframe-derived HLS segment tables (infra::hls). `CREATE TABLE IF NOT
    // EXISTS` is idempotent for DBs created before the table existed.
    "CREATE TABLE IF NOT EXISTS file_segments (\
        file_id TEXT PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,\
        mtime INTEGER, size INTEGER, version INTEGER NOT NULL,\
        duration_us INTEGER NOT NULL, v_codec TEXT,\
        segments TEXT NOT NULL, updated_at INTEGER NOT NULL)",
    // One-time migration for DBs created before the language-agnostic cache.
    // Each statement is idempotent, and must run in this order: the backfills
    // (1, 2) need the old columns/indexes still present to read from.
    //
    // 1) Seed `metadata_core.tmdb_id` (+ the other invariant fields) from the
    //    existing single-language `metadata` blobs, so availability matching can
    //    move off the json_extract indexes without re-enriching the catalog.
    "INSERT OR IGNORE INTO metadata_core \
        (subject_kind,subject_id,tmdb_id,imdb_id,release_date,rating,poster_url,backdrop_url,logo_url,updated_at) \
     SELECT 'item', id, json_extract(metadata,'$.tmdbId'), json_extract(metadata,'$.imdbId'), \
        json_extract(metadata,'$.releaseDate'), json_extract(metadata,'$.rating'), \
        json_extract(metadata,'$.posterUrl'), json_extract(metadata,'$.backdropUrl'), \
        json_extract(metadata,'$.logoUrl'), CAST(strftime('%s','now') AS INTEGER)*1000 \
     FROM items WHERE metadata IS NOT NULL AND kind IN ('movie','video')",
    "INSERT OR IGNORE INTO metadata_core \
        (subject_kind,subject_id,tmdb_id,imdb_id,release_date,rating,poster_url,backdrop_url,logo_url,updated_at) \
     SELECT 'show', id, json_extract(metadata,'$.tmdbId'), json_extract(metadata,'$.imdbId'), \
        json_extract(metadata,'$.releaseDate'), json_extract(metadata,'$.rating'), \
        json_extract(metadata,'$.posterUrl'), json_extract(metadata,'$.backdropUrl'), \
        json_extract(metadata,'$.logoUrl'), CAST(strftime('%s','now') AS INTEGER)*1000 \
     FROM shows WHERE metadata IS NOT NULL",
    // 2) Backfill the old per-language curated / suggestion columns into the
    //    generic translation cache BEFORE dropping those columns.
    "INSERT OR IGNORE INTO translations (subject_kind,subject_id,lang,source,data,updated_at) \
     SELECT 'curated', key, 'fr', 'llm', json_object('title',title_fr,'reason',reason_fr), \
        CAST(strftime('%s','now') AS INTEGER)*1000 \
     FROM curated_sections WHERE title_fr IS NOT NULL OR reason_fr IS NOT NULL",
    "INSERT OR IGNORE INTO translations (subject_kind,subject_id,lang,source,data,updated_at) \
     SELECT 'curated', key, 'en', 'llm', json_object('title',title_en,'reason',reason_en), \
        CAST(strftime('%s','now') AS INTEGER)*1000 \
     FROM curated_sections WHERE title_en IS NOT NULL OR reason_en IS NOT NULL",
    "INSERT OR IGNORE INTO translations (subject_kind,subject_id,lang,source,data,updated_at) \
     SELECT 'suggestion', item_id, 'fr', 'llm', json_object('reason',reason_fr), \
        CAST(strftime('%s','now') AS INTEGER)*1000 \
     FROM item_suggestions WHERE reason_fr IS NOT NULL",
    "INSERT OR IGNORE INTO translations (subject_kind,subject_id,lang,source,data,updated_at) \
     SELECT 'suggestion', item_id, 'en', 'llm', json_object('reason',reason_en), \
        CAST(strftime('%s','now') AS INTEGER)*1000 \
     FROM item_suggestions WHERE reason_en IS NOT NULL",
    // 3) Retire the json_extract availability indexes (now on metadata_core).
    "DROP INDEX IF EXISTS idx_items_tmdb",
    "DROP INDEX IF EXISTS idx_shows_tmdb",
    // 4) Drop the now-migrated per-language columns (SQLite >= 3.35).
    "ALTER TABLE curated_sections DROP COLUMN title_fr",
    "ALTER TABLE curated_sections DROP COLUMN title_en",
    "ALTER TABLE curated_sections DROP COLUMN reason_fr",
    "ALTER TABLE curated_sections DROP COLUMN reason_en",
    "ALTER TABLE item_suggestions DROP COLUMN reason_fr",
    "ALTER TABLE item_suggestions DROP COLUMN reason_en",
    // The device's User-Agent captured when its access token is minted, so the
    // account's session list can label each device.
    "ALTER TABLE access_tokens ADD COLUMN user_agent TEXT",
    // The parent access token a session was minted from, so the account can
    // tell which listed device is the one making the current request.
    "ALTER TABLE sessions ADD COLUMN access_token TEXT",
    // One row per registered authenticator. `id` is the credential id
    // (base64url); `credential` is the serialized webauthn-rs `Passkey` (JSON).
    "CREATE TABLE IF NOT EXISTS passkeys (\
        id          TEXT PRIMARY KEY,\
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\
        name        TEXT NOT NULL,\
        credential  TEXT NOT NULL,\
        created_at  TEXT NOT NULL,\
        last_used   TEXT)",
    "CREATE INDEX IF NOT EXISTS idx_passkeys_user ON passkeys(user_id)",
    // Earliest auto-retry time for a failed pipeline task (exponential backoff
    // between attempts, so a manually re-kicked stage doesn't hammer a flaky
    // dependency).
    "ALTER TABLE pipeline_tasks ADD COLUMN next_retry_at INTEGER",
    // Individual-episode subset for a show request (JSON array of
    // {season,episode}), unioned with the `seasons` full-season subset.
    "ALTER TABLE requests ADD COLUMN episodes TEXT",
    // Airing signals synced from TMDB by the acquisition.refresh job.
    "ALTER TABLE requests ADD COLUMN air_status TEXT",
    "ALTER TABLE requests ADD COLUMN next_air_date TEXT",
    "ALTER TABLE requests ADD COLUMN last_refresh_at INTEGER",
    // Per-row search backoff: how many fruitless passes this row has cost,
    // and the epoch-ms before which the next one must not bother. NULL is
    // "due now", so rows from before the column keep their turn.
    "ALTER TABLE wanted ADD COLUMN search_attempts INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE wanted ADD COLUMN next_search_at INTEGER",
    // `wanted_searchable` selects on status + next_search_at and orders by
    // air date; the old (status, last_search_at) index served neither. Both
    // statements run here, after the column they name exists.
    "DROP INDEX IF EXISTS idx_wanted_search",
    "CREATE INDEX IF NOT EXISTS idx_wanted_due ON wanted(status, next_search_at, air_date)",
    "CREATE TABLE IF NOT EXISTS audio_analysis (\
        file_id     TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,\
        track_index INTEGER NOT NULL,\
        lufs_i      REAL NOT NULL,\
        lra         REAL NOT NULL,\
        true_peak   REAL NOT NULL,\
        dialog_lufs REAL,\
        verdict     TEXT NOT NULL,\
        updated_at  TEXT NOT NULL,\
        PRIMARY KEY (file_id, track_index))",
    // The old `acq_tmdb(logical_id)` keyed the import's known id by a
    // recomputed logical id that orphaned on a title-parse mismatch; replaced
    // by `acq_file_tmdb(abs_path)` (created in SCHEMA above).
    "DROP TABLE IF EXISTS acq_tmdb",
];
