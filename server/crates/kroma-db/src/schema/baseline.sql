CREATE TABLE libraries (
        id        TEXT PRIMARY KEY,
        name      TEXT NOT NULL,
        kind      TEXT NOT NULL,
        path      TEXT NOT NULL,
        added_at  TEXT NOT NULL
    );
CREATE TABLE shows (
        id        TEXT PRIMARY KEY,
        library   TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
        title     TEXT NOT NULL,
        year      INTEGER,
        metadata  TEXT,
        added_at  TEXT NOT NULL
    );
CREATE TABLE items (
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
CREATE TABLE files (
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
        probed      INTEGER NOT NULL DEFAULT 0,
        unreadable  TEXT,
        v_hdr_format TEXT,
        v_dv_profile INTEGER,
        v_color_primaries TEXT,
        v_color_transfer  TEXT,
        v_color_matrix    TEXT
    );
CREATE INDEX idx_items_library ON items(library);
CREATE INDEX idx_items_kind    ON items(kind);
CREATE INDEX idx_items_show    ON items(show_id, season, episode);
CREATE INDEX idx_items_added   ON items(added_at DESC);
CREATE INDEX idx_shows_library ON shows(library);
CREATE INDEX idx_files_item    ON files(item_id);
CREATE INDEX idx_files_abs     ON files(abs_path);
CREATE INDEX idx_files_probed  ON files(probed);
CREATE TABLE markers (
        item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        kind       TEXT NOT NULL,
        start_ms   INTEGER NOT NULL,
        end_ms     INTEGER NOT NULL,
        source     TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (item_id, kind)
    );
CREATE TABLE audio_analysis (
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
CREATE TABLE downloaded_subtitles (
        id         TEXT PRIMARY KEY,
        item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        language   TEXT,
        label      TEXT NOT NULL,
        provider   TEXT NOT NULL,
        path       TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
CREATE INDEX idx_dl_subs_item ON downloaded_subtitles(item_id);
CREATE TABLE users (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
        username      TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        avatar_url    TEXT,
        permissions   TEXT NOT NULL DEFAULT '["playback"]',
        created_at    TEXT NOT NULL
    , last_seen TEXT, language TEXT, pin_hash TEXT, audio_language TEXT, subtitle_language TEXT, email_verified_at TEXT, libraries TEXT, whats_new_seen TEXT);
CREATE TABLE sessions (
        token      TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at INTEGER NOT NULL
    , access_token TEXT);
CREATE TABLE access_tokens (
        token        TEXT PRIMARY KEY,
        user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at   TEXT NOT NULL,
        expires_at   INTEGER NOT NULL,
        pin_verified INTEGER NOT NULL DEFAULT 0,
        last_seen    TEXT
    , user_agent TEXT, language TEXT);
CREATE TABLE progress (
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        item_id     TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        position_ms INTEGER NOT NULL,
        duration_ms INTEGER,
        updated_at  TEXT NOT NULL,
        PRIMARY KEY (user_id, item_id)
    );
CREATE TABLE invites (
        token       TEXT PRIMARY KEY,
        permissions TEXT NOT NULL DEFAULT '["playback"]',
        created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at  TEXT NOT NULL,
        expires_at  INTEGER NOT NULL,
        used_at     TEXT
    );
CREATE TABLE credential_resets (
        token       TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_hash   TEXT NOT NULL,
        attempts    INTEGER NOT NULL DEFAULT 0,
        created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at  TEXT NOT NULL,
        expires_at  INTEGER NOT NULL,
        used_at     TEXT
    );
CREATE TABLE email_verifications (
        token       TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        email       TEXT NOT NULL,
        created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at  TEXT NOT NULL,
        expires_at  INTEGER NOT NULL,
        used_at     TEXT
    );
CREATE TABLE reset_requests (
        user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        created_at  TEXT NOT NULL
    );
CREATE TABLE watched (
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        item_id    TEXT NOT NULL,
        watched_at TEXT NOT NULL,
        PRIMARY KEY (user_id, item_id)
    );
CREATE TABLE season_meta (
        show_id TEXT NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
        season  INTEGER NOT NULL,
        casts   TEXT NOT NULL,
        PRIMARY KEY (show_id, season)
    );
CREATE TABLE library_gaps (
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
CREATE TABLE episode_guide (
        show_id   TEXT NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
        season    INTEGER NOT NULL,
        episode   INTEGER NOT NULL,
        title     TEXT,
        overview  TEXT,
        air_date  TEXT,
        still_url TEXT,
        PRIMARY KEY (show_id, season, episode)
    );
CREATE TABLE my_list (
        user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        item_id  TEXT NOT NULL,
        added_at TEXT NOT NULL,
        PRIMARY KEY (user_id, item_id)
    );
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_progress_user ON progress(user_id, updated_at DESC);
CREATE INDEX idx_watched_user  ON watched(user_id);
CREATE INDEX idx_my_list_user  ON my_list(user_id, added_at DESC);
CREATE TABLE settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
CREATE TABLE play_history (
        id         TEXT PRIMARY KEY,
        user_id    TEXT,
        username   TEXT,
        item_id    TEXT,
        kind       TEXT NOT NULL,
        title      TEXT NOT NULL,
        library    TEXT,
        started_at INTEGER NOT NULL,
        ended_at   INTEGER NOT NULL,
        watched_ms INTEGER NOT NULL DEFAULT 0,
        device      TEXT,
        player      TEXT,
        mode        TEXT,
        network     TEXT,
        video_label TEXT,
        audio_label TEXT,
        show_title  TEXT,
        season      INTEGER,
        episode     INTEGER
    );
CREATE INDEX idx_history_user  ON play_history(user_id, ended_at DESC);
CREATE INDEX idx_history_ended ON play_history(ended_at DESC);
CREATE TABLE item_vectors (
        id         TEXT PRIMARY KEY,
        dim        INTEGER NOT NULL,
        vec        BLOB NOT NULL,
        updated_at TEXT NOT NULL
    );
CREATE TABLE job_schedules (
        key        TEXT PRIMARY KEY,
        schedule   TEXT,
        enabled    INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
    );
CREATE TABLE job_runs (
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
CREATE INDEX idx_job_runs_key ON job_runs(job_key, started_at DESC);
CREATE TABLE job_logs (
        run_id  TEXT NOT NULL,
        ts      INTEGER NOT NULL,
        level   TEXT NOT NULL,
        message TEXT NOT NULL
    );
CREATE INDEX idx_job_logs_run ON job_logs(run_id, ts);
CREATE TABLE user_taste (
        user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        profile    TEXT,
        sections   TEXT NOT NULL DEFAULT '[]',
        updated_at INTEGER NOT NULL
    );
CREATE TABLE curated_sections (
        key        TEXT PRIMARY KEY,
        rank       INTEGER NOT NULL DEFAULT 0,
        source     TEXT NOT NULL DEFAULT 'llm',
        item_ids   TEXT NOT NULL DEFAULT '[]',
        updated_at INTEGER NOT NULL
    );
CREATE TABLE item_suggestions (
        item_id    TEXT PRIMARY KEY,
        item_ids   TEXT NOT NULL DEFAULT '[]',
        updated_at INTEGER NOT NULL
    );
CREATE TABLE file_segments (
        file_id     TEXT PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
        mtime       INTEGER,
        size        INTEGER,
        version     INTEGER NOT NULL,
        duration_us INTEGER NOT NULL,
        v_codec     TEXT,
        segments    TEXT NOT NULL,
        updated_at  INTEGER NOT NULL
    );
CREATE TABLE pipeline_tasks (
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
CREATE INDEX idx_pipeline_ready
        ON pipeline_tasks(stage, status, priority DESC, enqueued_at);
CREATE INDEX idx_pipeline_subject
        ON pipeline_tasks(stage, subject_id);
CREATE TABLE requests (
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
CREATE INDEX idx_requests_status ON requests(status, created_at DESC);
CREATE INDEX idx_requests_ident  ON requests(kind, tmdb_id);
CREATE INDEX idx_requests_user   ON requests(requested_by, created_at DESC);
CREATE TABLE monitored (
        kind                TEXT NOT NULL,
        tmdb_id             INTEGER NOT NULL,
        title               TEXT NOT NULL,
        year                INTEGER,
        poster_url          TEXT,
        seasons             TEXT NOT NULL DEFAULT '[]',
        monitor_new_seasons INTEGER NOT NULL DEFAULT 0,
        min_availability    TEXT NOT NULL DEFAULT 'released',
        last_season         INTEGER,
        known_episodes      TEXT NOT NULL DEFAULT '{}',
        original_language   TEXT,
        aliases             TEXT NOT NULL DEFAULT '[]',
        air_status          TEXT,
        refreshed_at        INTEGER,
        added_by            TEXT REFERENCES users(id) ON DELETE SET NULL,
        added_at            INTEGER NOT NULL,
        updated_at          INTEGER NOT NULL,
        PRIMARY KEY (kind, tmdb_id)
    );
CREATE TABLE wanted (
        id             TEXT PRIMARY KEY,
        request_id     TEXT REFERENCES requests(id) ON DELETE SET NULL,
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
        vanished_at    INTEGER,
        updated_at     INTEGER NOT NULL
    );
CREATE INDEX idx_wanted_request ON wanted(request_id);
CREATE INDEX idx_wanted_ident   ON wanted(tmdb_id, season, episode);
CREATE TABLE reports (
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
CREATE INDEX idx_reports_status  ON reports(status, created_at DESC);
CREATE INDEX idx_reports_subject ON reports(subject_kind, subject_id);
CREATE INDEX idx_reports_user    ON reports(reported_by, created_at DESC);
CREATE TABLE notifications (
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
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread
        ON notifications(user_id) WHERE read_at IS NULL;
CREATE TABLE notification_prefs (
        user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category TEXT NOT NULL,
        in_app   INTEGER NOT NULL DEFAULT 1,
        push     INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (user_id, category)
    );
CREATE TABLE push_subscriptions (
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
CREATE INDEX idx_push_subs_user ON push_subscriptions(user_id);
CREATE TABLE acq_file_tmdb (
        abs_path  TEXT PRIMARY KEY,
        tmdb_id   INTEGER NOT NULL
    );
CREATE TABLE tmdb_pin (
        subject_kind TEXT NOT NULL,          -- 'item' | 'show'
        subject_id   TEXT NOT NULL,
        tmdb_id      INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL,
        PRIMARY KEY (subject_kind, subject_id)
    );
CREATE TABLE metadata_core (
        subject_kind TEXT NOT NULL,          -- 'item' | 'show'
        subject_id   TEXT NOT NULL,
        tmdb_id      INTEGER,
        imdb_id      TEXT,
        tvdb_id      INTEGER,
        release_date TEXT,
        rating       REAL,
        -- The provider's own spelling of the age rating, e.g. 'PG-13' | 'TV-MA' | '12'.
        certification TEXT,
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
CREATE INDEX idx_meta_core_tmdb ON metadata_core(tmdb_id);
CREATE TABLE translations (
        subject_kind TEXT NOT NULL,   -- 'item'|'show'|'episode'|'episode_guide'|'season_cast'|'curated'|'suggestion'
        subject_id   TEXT NOT NULL,
        lang         TEXT NOT NULL,   -- a code from i18n::SUPPORTED_LOCALES
        source       TEXT NOT NULL,   -- 'tmdb' | 'llm' | 'manual'
        data         TEXT NOT NULL,   -- JSON: {title,overview,tagline,genres,posterUrl?,logoUrl?,characters?,reason?,rev?}
        updated_at   INTEGER NOT NULL,
        PRIMARY KEY (subject_kind, subject_id, lang)
    );
CREATE INDEX idx_translations_lang ON translations(subject_kind, lang);
CREATE TABLE downloads (
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
        upgrade         INTEGER NOT NULL DEFAULT 0,
        downloaded_bytes INTEGER NOT NULL DEFAULT 0,
        uploaded_bytes  INTEGER NOT NULL DEFAULT 0,
        match_source    TEXT
    );
CREATE INDEX idx_downloads_status ON downloads(status, grabbed_at DESC);
CREATE INDEX idx_downloads_req    ON downloads(request_id);
CREATE TABLE metric_samples (
        at         INTEGER NOT NULL,
        step_secs  INTEGER NOT NULL,
        cpu_kroma  REAL NOT NULL,
        cpu_system REAL NOT NULL,
        cpu_media  REAL NOT NULL,
        ram_kroma  REAL NOT NULL,
        ram_system REAL NOT NULL,
        bw_local   REAL NOT NULL,
        bw_remote  REAL NOT NULL,
        PRIMARY KEY (step_secs, at)
    );
CREATE INDEX idx_metric_samples_at ON metric_samples(at);
CREATE TABLE whisper_jobs (
        id     TEXT PRIMARY KEY,
        stage  TEXT NOT NULL DEFAULT '',
        done   INTEGER NOT NULL DEFAULT 0,
        total  INTEGER NOT NULL DEFAULT 0,
        cancel INTEGER NOT NULL DEFAULT 0
    );
CREATE UNIQUE INDEX idx_users_username ON users(username);
CREATE TABLE passkeys (id          TEXT PRIMARY KEY,user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name        TEXT NOT NULL,credential  TEXT NOT NULL,created_at  TEXT NOT NULL,last_used   TEXT);
CREATE INDEX idx_passkeys_user ON passkeys(user_id);
CREATE INDEX idx_wanted_due ON wanted(status, next_search_at, air_date);
CREATE INDEX idx_downloads_grabbed ON downloads(grabbed_at DESC);
CREATE INDEX idx_downloads_client ON downloads(client_id, grabbed_at DESC);
CREATE INDEX idx_history_library ON play_history(library, ended_at DESC);
CREATE INDEX idx_history_item ON play_history(item_id);
CREATE TABLE pin_attempts (user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,fails        INTEGER NOT NULL DEFAULT 0,locked_until INTEGER NOT NULL DEFAULT 0);
CREATE UNIQUE INDEX idx_wanted_unit ON wanted(kind, tmdb_id, IFNULL(season, -1), IFNULL(episode, -1));
