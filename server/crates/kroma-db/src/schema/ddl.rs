//! The core schema: connection pragmas, tables, indices and the canonical
//! column lists item/file SELECTs project.

pub(crate) const PRAGMAS: &str = "
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA temp_store = MEMORY;
    PRAGMA busy_timeout = 5000;
    PRAGMA mmap_size = 268435456;
    PRAGMA cache_size = -16000;
    -- ~40 MB checkpoints instead of the 4 MB default: frequent checkpoints
    -- stall readers on HDD during scan/probe bursts.
    PRAGMA wal_autocheckpoint = 10000;
";

pub(crate) const SCHEMA: &str = "
    CREATE TABLE IF NOT EXISTS libraries (
        id        TEXT PRIMARY KEY,
        name      TEXT NOT NULL,
        kind      TEXT NOT NULL,
        path      TEXT NOT NULL,
        added_at  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS shows (
        id        TEXT PRIMARY KEY,
        library   TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
        title     TEXT NOT NULL,
        year      INTEGER,
        metadata  TEXT,
        added_at  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS items (
        id            TEXT PRIMARY KEY,
        kind          TEXT NOT NULL,
        title         TEXT NOT NULL,
        year          INTEGER,
        duration_ms   INTEGER,
        container     TEXT NOT NULL,
        v_codec       TEXT,
        v_width       INTEGER,
        v_height      INTEGER,
        v_hdr         INTEGER,
        v_bit_depth   INTEGER,
        a_codec       TEXT,
        a_channels    INTEGER,
        a_language    TEXT,
        subtitles     TEXT NOT NULL DEFAULT '[]',
        library       TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
        show_id       TEXT REFERENCES shows(id) ON DELETE CASCADE,
        show_title    TEXT,
        season        INTEGER,
        episode       INTEGER,
        episode_end   INTEGER,
        episode_title TEXT,
        rel_path      TEXT,
        abs_path      TEXT,
        metadata      TEXT,
        added_at      TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS files (
        id          TEXT PRIMARY KEY,
        item_id     TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        abs_path    TEXT NOT NULL UNIQUE,
        rel_path    TEXT,
        container   TEXT NOT NULL DEFAULT '',
        size        INTEGER,
        mtime       INTEGER,
        edition     TEXT,
        duration_ms INTEGER,
        v_codec     TEXT,
        v_width     INTEGER,
        v_height    INTEGER,
        v_hdr       INTEGER,
        v_bit_depth INTEGER,
        a_codec     TEXT,
        a_channels  INTEGER,
        a_language  TEXT,
        audio_tracks TEXT NOT NULL DEFAULT '[]',
        subtitles   TEXT NOT NULL DEFAULT '[]',
        probed      INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_items_library ON items(library);
    CREATE INDEX IF NOT EXISTS idx_items_kind    ON items(kind);
    CREATE INDEX IF NOT EXISTS idx_items_show    ON items(show_id, season, episode);
    CREATE INDEX IF NOT EXISTS idx_items_added   ON items(added_at DESC);
    CREATE INDEX IF NOT EXISTS idx_shows_library ON shows(library);
    CREATE INDEX IF NOT EXISTS idx_files_item    ON files(item_id);
    CREATE INDEX IF NOT EXISTS idx_files_abs     ON files(abs_path);
    CREATE INDEX IF NOT EXISTS idx_files_probed  ON files(probed);

    -- Skip-intro / next-up markers. One row per (item, kind); kind is
    -- 'intro' | 'credits' | …; bounds in ms.
    CREATE TABLE IF NOT EXISTS markers (
        item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        kind       TEXT NOT NULL,
        start_ms   INTEGER NOT NULL,
        end_ms     INTEGER NOT NULL,
        source     TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (item_id, kind)
    );

    -- EBU R128 loudness per (file, audio track), written by pipeline.loudness.
    -- Raw measured values are kept so playback-side remediation can reuse them.
    CREATE TABLE IF NOT EXISTS audio_analysis (
        file_id     TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        track_index INTEGER NOT NULL,
        lufs_i      REAL NOT NULL,
        lra         REAL NOT NULL,
        true_peak   REAL NOT NULL,
        dialog_lufs REAL,
        verdict     TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        PRIMARY KEY (file_id, track_index)
    );

    -- Subtitles fetched from an online provider, converted to WebVTT and cached
    -- under <data>/subs/downloaded/; merged into the item's subtitle list.
    CREATE TABLE IF NOT EXISTS downloaded_subtitles (
        id         TEXT PRIMARY KEY,
        item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        language   TEXT,
        label      TEXT NOT NULL,
        provider   TEXT NOT NULL,
        path       TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_dl_subs_item ON downloaded_subtitles(item_id);

    CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
        username      TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        avatar_url    TEXT,
        permissions   TEXT NOT NULL DEFAULT '[\"playback\"]',
        created_at    TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
        token      TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at INTEGER NOT NULL
    );
    -- Long-lived per-device credential, exchanged for a short-lived session token
    -- via /auth/token. `pin_verified` gates PIN-locked accounts: set once the
    -- correct PIN is presented, letting silent refreshes skip re-prompting.
    CREATE TABLE IF NOT EXISTS access_tokens (
        token        TEXT PRIMARY KEY,
        user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at   TEXT NOT NULL,
        expires_at   INTEGER NOT NULL,
        pin_verified INTEGER NOT NULL DEFAULT 0,
        last_seen    TEXT
    );
    CREATE TABLE IF NOT EXISTS progress (
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        item_id     TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        position_ms INTEGER NOT NULL,
        duration_ms INTEGER,
        updated_at  TEXT NOT NULL,
        PRIMARY KEY (user_id, item_id)
    );
    CREATE TABLE IF NOT EXISTS invites (
        token       TEXT PRIMARY KEY,
        permissions TEXT NOT NULL DEFAULT '[\"playback\"]',
        created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at  TEXT NOT NULL,
        expires_at  INTEGER NOT NULL,
        used_at     TEXT
    );
    -- `item_id` is a movie item id OR a show id; intentionally NOT an items FK
    -- so a show can be marked watched as a whole.
    CREATE TABLE IF NOT EXISTS watched (
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        item_id    TEXT NOT NULL,
        watched_at TEXT NOT NULL,
        PRIMARY KEY (user_id, item_id)
    );
    -- Per-season TMDB cast (the show's seasons are derived from items, so this
    -- holds the season-level credits keyed by (show, season number)).
    CREATE TABLE IF NOT EXISTS season_meta (
        show_id TEXT NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
        season  INTEGER NOT NULL,
        casts   TEXT NOT NULL,
        PRIMARY KEY (show_id, season)
    );
    -- Library missing-episode scan: aired TMDB episodes not on disk, recomputed
    -- by the library.missing job. Title/poster are denormalized to avoid a join.
    CREATE TABLE IF NOT EXISTS library_gaps (
        show_id     TEXT NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
        tmdb_id     INTEGER NOT NULL,
        title       TEXT NOT NULL,
        poster_url  TEXT,
        season      INTEGER NOT NULL,
        episode     INTEGER NOT NULL,
        air_date    TEXT,
        detected_at INTEGER NOT NULL,
        PRIMARY KEY (show_id, season, episode)
    );
    -- Ma liste: user-bookmarked titles (movie item ids OR show ids; same
    -- no-items-FK rationale as `watched`). Synced across web + TV.
    CREATE TABLE IF NOT EXISTS my_list (
        user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        item_id  TEXT NOT NULL,
        added_at TEXT NOT NULL,
        PRIMARY KEY (user_id, item_id)
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_progress_user ON progress(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_watched_user  ON watched(user_id);
    CREATE INDEX IF NOT EXISTS idx_my_list_user  ON my_list(user_id, added_at DESC);

    CREATE TABLE IF NOT EXISTS settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS play_history (
        id         TEXT PRIMARY KEY,
        user_id    TEXT,
        username   TEXT,
        item_id    TEXT,
        kind       TEXT NOT NULL,
        title      TEXT NOT NULL,
        library    TEXT,
        started_at INTEGER NOT NULL,
        ended_at   INTEGER NOT NULL,
        watched_ms INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_history_user  ON play_history(user_id, ended_at DESC);
    CREATE INDEX IF NOT EXISTS idx_history_ended ON play_history(ended_at DESC);

    CREATE TABLE IF NOT EXISTS item_vectors (
        id         TEXT PRIMARY KEY,
        dim        INTEGER NOT NULL,
        vec        BLOB NOT NULL,
        updated_at TEXT NOT NULL
    );

    -- Background job system (see services::jobs). Per-job schedule overrides,
    -- one row per execution, and per-run log lines.
    CREATE TABLE IF NOT EXISTS job_schedules (
        key        TEXT PRIMARY KEY,
        schedule   TEXT,
        enabled    INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS job_runs (
        id             TEXT PRIMARY KEY,
        job_key        TEXT NOT NULL,
        trigger_kind   TEXT NOT NULL,
        status         TEXT NOT NULL,
        started_at     INTEGER NOT NULL,
        finished_at    INTEGER,
        progress_done  INTEGER,
        progress_total INTEGER,
        error          TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_job_runs_key ON job_runs(job_key, started_at DESC);
    CREATE TABLE IF NOT EXISTS job_logs (
        run_id  TEXT NOT NULL,
        ts      INTEGER NOT NULL,
        level   TEXT NOT NULL,
        message TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_job_logs_run ON job_logs(run_id, ts);

    -- Per-user LLM-generated taste profile plus the cached personalized home
    -- sections (JSON). See the `sections.personalize` job.
    CREATE TABLE IF NOT EXISTS user_taste (
        user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        profile    TEXT,
        sections   TEXT NOT NULL DEFAULT '[]',
        updated_at INTEGER NOT NULL
    );

    -- Global editorial collections, regenerated by the `sections.curate` job
    -- (member ids resolved at write time). Localized title/reason live in
    -- `translations` (`subject_kind='curated'`), not in per-language columns.
    CREATE TABLE IF NOT EXISTS curated_sections (
        key        TEXT PRIMARY KEY,
        rank       INTEGER NOT NULL DEFAULT 0,
        source     TEXT NOT NULL DEFAULT 'llm',
        item_ids   TEXT NOT NULL DEFAULT '[]',
        updated_at INTEGER NOT NULL
    );

    -- Per-item AI suggestions, lazily generated on first view; empty item_ids is
    -- a terminal `tried, nothing usable` marker. Localized reason lives in
    -- `translations` (`subject_kind='suggestion'`), not in per-language columns.
    CREATE TABLE IF NOT EXISTS item_suggestions (
        item_id    TEXT PRIMARY KEY,
        item_ids   TEXT NOT NULL DEFAULT '[]',
        updated_at INTEGER NOT NULL
    );

    -- Keyframe-derived HLS segment table per physical file (see infra::hls),
    -- computed lazily and revalidated by mtime/size/version.
    CREATE TABLE IF NOT EXISTS file_segments (
        file_id     TEXT PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
        mtime       INTEGER,
        size        INTEGER,
        version     INTEGER NOT NULL,
        duration_us INTEGER NOT NULL,
        v_codec     TEXT,
        segments    TEXT NOT NULL,
        updated_at  INTEGER NOT NULL
    );

    -- Per-element processing ledger (see services::pipeline): one row per
    -- (stage, subject). `input_sig` is a cheap signature of the subject's inputs,
    -- so unchanged + `status='done'` skips work and a changed one re-queues it.
    CREATE TABLE IF NOT EXISTS pipeline_tasks (
        stage        TEXT NOT NULL,
        subject_kind TEXT NOT NULL,
        subject_id   TEXT NOT NULL,
        status       TEXT NOT NULL,
        input_sig    TEXT,
        attempts     INTEGER NOT NULL DEFAULT 0,
        priority     INTEGER NOT NULL DEFAULT 0,
        error        TEXT,
        enqueued_at  INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL,
        started_at   INTEGER,
        finished_at  INTEGER,
        duration_ms  INTEGER,
        -- Earliest epoch-ms a `failed` task may be auto-retried (exponential
        -- backoff, set by `finish_batch`). NULL = no gate. Manual retry /
        -- reprocess / enqueue always clear it.
        next_retry_at INTEGER,
        PRIMARY KEY (stage, subject_kind, subject_id)
    );
    CREATE INDEX IF NOT EXISTS idx_pipeline_ready
        ON pipeline_tasks(stage, status, priority DESC, enqueued_at);
    -- Seek by (stage, subject_id) for the show/item roll-up (`worst_status`): the
    -- PK is (stage, subject_kind, subject_id), so subject_id can't be sought
    -- without this composite index.
    CREATE INDEX IF NOT EXISTS idx_pipeline_subject
        ON pipeline_tasks(stage, subject_id);

    -- Media requests (the 'ask for a title' flow). A show request may carry a
    -- season subset and/or an individual-episode subset (`episodes`); the target
    -- is their union. Linked to the catalog ONLY via tmdb_id: acquisition.match
    -- flips status once enrichment writes metadata.tmdbId for a local title.
    CREATE TABLE IF NOT EXISTS requests (
        id           TEXT PRIMARY KEY,
        kind         TEXT NOT NULL,
        tmdb_id      INTEGER NOT NULL,
        title        TEXT NOT NULL,
        year         INTEGER,
        poster_url   TEXT,
        seasons      TEXT,
        status       TEXT NOT NULL DEFAULT 'pending',
        requested_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        reviewed_by  TEXT,
        note         TEXT,
        episodes     TEXT,
        -- Airing signals synced from TMDB by the acquisition.refresh job.
        -- NULL until the first refresh.
        air_status     TEXT,
        next_air_date  TEXT,
        last_refresh_at INTEGER,
        created_at   INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_requests_ident  ON requests(kind, tmdb_id);
    CREATE INDEX IF NOT EXISTS idx_requests_user   ON requests(requested_by, created_at DESC);

    -- Episode-level wanted ledger, materialized when a request is approved.
    -- Season packs are computed at search time by grouping rows on (tmdb_id,
    -- season); there are no separate season rows.
    CREATE TABLE IF NOT EXISTS wanted (
        id             TEXT PRIMARY KEY,
        request_id     TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
        kind           TEXT NOT NULL,
        tmdb_id        INTEGER NOT NULL,
        imdb_id        TEXT,
        title          TEXT NOT NULL,
        year           INTEGER,
        season         INTEGER,
        episode        INTEGER,
        air_date       TEXT,
        status         TEXT NOT NULL DEFAULT 'wanted',
        last_search_at INTEGER,
        search_attempts INTEGER NOT NULL DEFAULT 0,
        next_search_at INTEGER,
        updated_at     INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_wanted_request ON wanted(request_id);
    CREATE INDEX IF NOT EXISTS idx_wanted_ident   ON wanted(tmdb_id, season, episode);

    -- User-submitted problem reports. `subject_id` is a movie/episode item id OR
    -- a show id (no items FK, same rationale as `watched`/`my_list`), and
    -- `subject_title` is snapshotted so the queue survives a re-scan/deletion.
    CREATE TABLE IF NOT EXISTS reports (
        id            TEXT PRIMARY KEY,
        subject_kind  TEXT NOT NULL,
        subject_id    TEXT NOT NULL,
        subject_title TEXT NOT NULL,
        category      TEXT NOT NULL,
        message       TEXT,
        status        TEXT NOT NULL DEFAULT 'open',
        reported_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
        resolved_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
        resolved_at   INTEGER,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reports_status  ON reports(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reports_subject ON reports(subject_kind, subject_id);
    CREATE INDEX IF NOT EXISTS idx_reports_user    ON reports(reported_by, created_at DESC);

    -- One row per (user, thing that happened). The text is NOT stored: `title_key`
    -- / `body_key` are i18n keys, rendered against the reader's locale on the way
    -- out, so switching language re-reads the whole history in the new one.
    -- `push_category` names a UNNotificationCategory (APNs can't render arbitrary
    -- buttons, so native push picks from a fixed set) while `actions` stays the
    -- full-fidelity in-app form. `category` is derived from `event` but stored,
    -- so the prefs filter and the UI grouping are one indexed column.
    CREATE TABLE IF NOT EXISTS notifications (
        id            TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category      TEXT NOT NULL,
        event         TEXT NOT NULL,
        title_key     TEXT NOT NULL,
        body_key      TEXT NOT NULL,
        params        TEXT NOT NULL DEFAULT '{}',
        link          TEXT,
        image_url     TEXT,
        actions       TEXT NOT NULL DEFAULT '[]',
        push_category TEXT,
        read_at       INTEGER,
        created_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
    -- Partial index: the bell badge counts unread only, and unread is the small
    -- side of the table (rows are marked read and then aged out).
    CREATE INDEX IF NOT EXISTS idx_notifications_unread
        ON notifications(user_id) WHERE read_at IS NULL;

    -- Per-user delivery matrix. A MISSING row means 'on' for both channels, so a
    -- newly added category starts enabled without backfilling every user, and
    -- only deviations from the default cost a row.
    CREATE TABLE IF NOT EXISTS notification_prefs (
        user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category TEXT NOT NULL,
        in_app   INTEGER NOT NULL DEFAULT 1,
        push     INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (user_id, category)
    );

    -- One row per push endpoint. For Web Push `endpoint` is the push service URL
    -- and `p256dh`/`auth` are the subscription's client keys (RFC 8291); for the
    -- native transports `endpoint` is the raw device token and both are NULL.
    CREATE TABLE IF NOT EXISTS push_subscriptions (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        transport  TEXT NOT NULL,
        endpoint   TEXT NOT NULL,
        p256dh     TEXT,
        auth       TEXT,
        device     TEXT,
        locale     TEXT,
        failures   INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        last_ok_at INTEGER,
        UNIQUE (transport, endpoint)
    );
    CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);

    -- The acquisition MODULE tables (`indexers`, `download_clients`, `downloads`)
    -- no longer live here: each is owned by its module crate and created at DB
    -- init via that module's `ServerModule::migrations`, run right after this
    -- core schema (so `downloads.request_id` can FK the `requests` table above).

    -- Known TMDB id for an acquired file, keyed by the ABSOLUTE PATH the import
    -- wrote it to: the import knows exactly where it placed the file, and the
    -- scanner records that same (canonicalized) path in `files.abs_path`, so the
    -- join is on ground truth and can never orphan on a title-parse difference
    -- (unlike guessing from the filename, e.g. Scary Movie vs A Scary Movie).
    CREATE TABLE IF NOT EXISTS acq_file_tmdb (
        abs_path  TEXT PRIMARY KEY,
        tmdb_id   INTEGER NOT NULL
    );

    -- Availability matching is a seek on `metadata_core.tmdb_id` (a real indexed
    -- column, see idx_meta_core_tmdb below); the old json_extract expression
    -- indexes on the metadata blob are retired in `migrate`.

    -- An operator-chosen TMDB id for one catalog subject, set from the 'fix the
    -- match' picker. Enrichment consults this BEFORE any title guess, so a
    -- correction is authoritative and survives every re-scan. Distinct from
    -- `acq_file_tmdb` above (set automatically at import): this operator choice
    -- takes precedence over it.
    CREATE TABLE IF NOT EXISTS tmdb_pin (
        subject_kind TEXT NOT NULL,          -- 'item' | 'show'
        subject_id   TEXT NOT NULL,
        tmdb_id      INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL,
        PRIMARY KEY (subject_kind, subject_id)
    );

    -- Language-INVARIANT resolved metadata, one row per catalog subject. Split
    -- out of the per-item `metadata` JSON so identity/availability/art/cast don't
    -- depend on which language was fetched, and switching UI language never
    -- touches this row (nor the embeddings derived from it).
    --
    -- A provider id is stored ON THE RECORD IT IDENTIFIES, under a
    -- provider-qualified name: this title's own ids are the columns below, and
    -- a credited person's rides on its member inside cast_json / crew_json (a
    -- serde field, so people cost no schema change). Only a bare reference list
    -- the title holds, like genres, earns a column of its own here.
    CREATE TABLE IF NOT EXISTS metadata_core (
        subject_kind TEXT NOT NULL,          -- 'item' | 'show'
        subject_id   TEXT NOT NULL,
        tmdb_id      INTEGER,
        imdb_id      TEXT,
        tvdb_id      INTEGER,
        release_date TEXT,
        rating       REAL,
        poster_url   TEXT,
        backdrop_url TEXT,
        logo_url     TEXT,
        cast_json    TEXT NOT NULL DEFAULT '[]',
        crew_json    TEXT NOT NULL DEFAULT '[]',
        -- The NAMES are localized and live in `translations`; these do not.
        tmdb_genre_ids TEXT NOT NULL DEFAULT '[]',
        updated_at   INTEGER NOT NULL,
        PRIMARY KEY (subject_kind, subject_id)
    );
    CREATE INDEX IF NOT EXISTS idx_meta_core_tmdb ON metadata_core(tmdb_id);

    -- The GENERIC per-language translation cache: one table for every localized
    -- string in the app, so adding a language is inserting rows, never a schema
    -- change. `resolve` falls back requested lang -> en -> any.
    CREATE TABLE IF NOT EXISTS translations (
        subject_kind TEXT NOT NULL,   -- 'item'|'show'|'episode'|'season_cast'|'curated'|'suggestion'
        subject_id   TEXT NOT NULL,
        lang         TEXT NOT NULL,   -- a code from i18n::SUPPORTED_LOCALES
        source       TEXT NOT NULL,   -- 'tmdb' | 'llm' | 'manual'
        data         TEXT NOT NULL,   -- JSON: {title,overview,tagline,genres,logoUrl,characters?,reason?}
        updated_at   INTEGER NOT NULL,
        PRIMARY KEY (subject_kind, subject_id, lang)
    );
    -- Serve a whole home row in one language in a single indexed scan
    -- (WHERE subject_kind=? AND lang=? AND subject_id IN (...)).
    CREATE INDEX IF NOT EXISTS idx_translations_lang ON translations(subject_kind, lang);

    -- The two SHARED tables below are written by a module and read by the core.
    -- They live here, in the core schema, because that is what they are: a
    -- module holds a grant on them, and a grant cannot create a table. A module
    -- table nothing outside it reads belongs in its own file instead (see
    -- kroma-db's `grant` and the supervisor's `adopt`).

    -- One row per grab: a release the downloads module sent to a client. The
    -- core reads it for the live progress overlay on request / discover lists,
    -- and `request_id` is a real foreign key into `requests`, so it could not
    -- live anywhere else. `client_id` has NO foreign key, so history survives a
    -- deleted client config.
    CREATE TABLE IF NOT EXISTS downloads (
        id              TEXT PRIMARY KEY,
        client_id       TEXT NOT NULL,
        client_ref      TEXT NOT NULL,
        request_id      TEXT REFERENCES requests(id) ON DELETE SET NULL,
        kind            TEXT NOT NULL,
        tmdb_id         INTEGER NOT NULL,
        title           TEXT,
        year            INTEGER,
        season          INTEGER,
        episodes        TEXT,
        release_title   TEXT NOT NULL,
        indexer_id      TEXT,
        info_hash       TEXT,
        magnet_or_url   TEXT NOT NULL,
        size_bytes      INTEGER,
        score           INTEGER,
        score_breakdown TEXT,
        status          TEXT NOT NULL DEFAULT 'queued',
        progress        REAL NOT NULL DEFAULT 0,
        save_path       TEXT,
        imported_paths  TEXT,
        error           TEXT,
        grabbed_at      INTEGER NOT NULL,
        completed_at    INTEGER,
        imported_at     INTEGER,
        details_url     TEXT,
        only_files      TEXT,
        upgrade         INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status, grabbed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_downloads_req    ON downloads(request_id);

    -- The transcription progress channel. A whisper run is minutes long and
    -- drives live progress plus a mid-run cancel, which do not fit the buffered
    -- request/response the port bridge speaks: the core writes `cancel` and
    -- polls the rest, the sidecar does the reverse.
    CREATE TABLE IF NOT EXISTS whisper_jobs (
        id     TEXT PRIMARY KEY,
        stage  TEXT NOT NULL DEFAULT '',
        done   INTEGER NOT NULL DEFAULT 0,
        total  INTEGER NOT NULL DEFAULT 0,
        cancel INTEGER NOT NULL DEFAULT 0
    );
";

/// Explicit column list for file SELECTs keeps [`crate::row_to_file`] index-stable.
pub(crate) const FILE_COLS: &str = "id,rel_path,container,size,edition,probed,\
    duration_ms,v_codec,v_width,v_height,v_hdr,v_bit_depth,\
    a_codec,a_channels,a_language,subtitles,abs_path,audio_tracks";

/// Explicit column list for item SELECTs keeps [`crate::row_to_item`] index-stable.
/// `metadata` is appended last (index 25).
pub(crate) const ITEM_COLS: &str = "id,kind,title,year,duration_ms,container,\
    v_codec,v_width,v_height,v_hdr,v_bit_depth,a_codec,a_channels,a_language,subtitles,\
    library,show_id,show_title,season,episode,episode_end,episode_title,rel_path,abs_path,added_at,metadata";
