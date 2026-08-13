//! Native Cardigann indexer engine: runs Cardigann YAML tracker definitions
//! directly, as an alternative to Torznab/Jackett/Prowlarr. Definitions are
//! GPL and fetched at runtime by [`store`], not vendored into this MIT repo.

use serde::{Deserialize, Serialize};

pub mod category;
pub mod context;
pub mod db;
pub mod definition;
pub mod dtos;
pub mod engine;
pub mod filters;
pub mod module;
pub mod selector;
pub mod session;
pub mod store;
pub mod admin;
pub mod routes;
pub mod template;
pub mod xmltree;
#[cfg(feature = "xpath")]
pub mod xpath;

pub use dtos::*;

pub use session::{DownloadTarget, SearchOutcome, Session};

pub use definition::Definition;
pub use module::MODULE;

pub const MODULE_ID: &str = "tv.kroma.indexer";

/// The Indexers sub-module: exposes the native-engine admin routes over the
/// HostCtx seam. Lifecycle-free (disabling it just gates its routes off).
pub struct IndexersModule;

#[kroma_module_sdk::host::async_trait]
impl<S: kroma_module_sdk::host::HostCtx + Clone + Send + Sync + 'static>
    kroma_module_sdk::host::ServerModule<S> for IndexersModule
{
    fn id(&self) -> &'static str {
        MODULE_ID
    }

    fn migrations(&self) -> &'static str {
        db::MIGRATIONS
    }

    fn admin_routes(&self, _host: &S) -> Option<axum::Router<S>> {
        Some(routes::routes::<S>())
    }
}

/// This module's backend behavior, for the host's generic module roster.
pub fn server_module<S: kroma_module_sdk::host::HostCtx + Clone + Send + Sync + 'static>(
) -> Box<dyn kroma_module_sdk::host::ServerModule<S>> {
    Box::new(IndexersModule)
}

/// The [`TorrentFetchPort`](kroma_module_sdk::ports::TorrentFetchPort) impl: fetches a
/// `.torrent` through a built-in Cardigann indexer's authenticated session.
pub struct IndexerTorrentFetch;

impl kroma_module_sdk::ports::TorrentFetchPort for IndexerTorrentFetch {
    fn fetch_torrent(
        &self,
        host: &dyn kroma_module_sdk::host::HostCtx,
        indexer_id: &str,
        url: &str,
    ) -> Option<anyhow::Result<Vec<u8>>> {
        let conn = match host.db().get() {
            Ok(conn) => conn,
            Err(e) => return Some(Err(e)),
        };
        let row = match crate::db::get_indexer(&conn, indexer_id) {
            Ok(Some(row)) => row,
            Ok(None) => return None,
            Err(e) => return Some(Err(e.into())),
        };
        drop(conn);
        // Only built-in indexers cookie-gate downloads; Torznab/manual grabs use the caller's plain fetch.
        if row.kind != admin::KIND_BUILTIN {
            return None;
        }
        Some((|| {
            let session = admin::builtin_session(host, &row)?;
            session.fetch_torrent(url)
        })())
    }
}

/// A configured built-in indexer: the chosen base link plus admin-entered
/// settings (`.Config.<name>` resolves against this, falling back to definition defaults).
#[derive(Debug, Clone, Default)]
pub struct IndexerConfig {
    pub base_url: String,
    pub settings: std::collections::HashMap<String, String>,
}

/// One search request. Mirrors [`kroma_torznab::Query`] so the acquisition layer
/// builds one query shape for both engines.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Query {
    Movie { tmdb_id: Option<u64>, imdb_id: Option<String>, title: String, year: Option<u32> },
    Episode { tmdb_id: Option<u64>, title: String, season: u32, episode: u32 },
    Season { tmdb_id: Option<u64>, title: String, season: u32 },
    Text { query: String },
}

impl Query {
    /// The title alone, with no season/episode tag. What `{{ .Keywords }}` must
    /// expand to for a definition that sends the numbers as their own inputs.
    pub fn title(&self) -> String {
        match self {
            Query::Movie { title, year, .. } => match year {
                Some(y) => format!("{title} {y}"),
                None => title.clone(),
            },
            Query::Episode { title, .. } | Query::Season { title, .. } => title.clone(),
            Query::Text { query } => query.clone(),
        }
    }

    /// The free-text keywords a definition's `{{ .Keywords }}` expands to.
    pub fn keywords(&self) -> String {
        match self {
            Query::Movie { title, year, .. } => match year {
                Some(y) => format!("{title} {y}"),
                None => title.clone(),
            },
            Query::Episode { title, season, episode, .. } => {
                format!("{title} S{season:02}E{episode:02}")
            }
            Query::Season { title, season, .. } => format!("{title} S{season:02}"),
            Query::Text { query } => query.clone(),
        }
    }
}

/// A normalized release, field-compatible with [`kroma_torznab::Release`] plus
/// the richer attributes Cardigann exposes (categories, freeleech factors).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Release {
    pub title: String,
    pub guid: String,
    pub link: Option<String>,
    pub magnet: Option<String>,
    pub info_hash: Option<String>,
    pub size_bytes: Option<u64>,
    pub seeders: Option<u32>,
    pub leechers: Option<u32>,
    pub grabs: Option<u32>,
    pub tmdb_id: Option<u64>,
    pub imdb_id: Option<String>,
    pub published_at: Option<String>,
    pub details_url: Option<String>,
    pub categories: Vec<u32>,
    pub download_volume_factor: Option<f64>,
    pub upload_volume_factor: Option<f64>,
}

/// What a definition advertises it can do, derived from `caps.modes`. Mirrors
/// [`kroma_torznab::Caps`] so capability-aware query building is shared.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Caps {
    pub search_tmdb: bool,
    pub search_imdb: bool,
    pub tv_search_tmdb: bool,
    pub tv_search_season: bool,
    pub server_title: Option<String>,
}

impl Caps {
    pub fn from_definition(def: &Definition) -> Self {
        let has = |mode: &str, param: &str| {
            def.caps.modes.get(mode).is_some_and(|params| params.iter().any(|p| p == param))
        };
        Caps {
            search_imdb: has("movie-search", "imdbid") || has("search", "imdbid"),
            search_tmdb: has("movie-search", "tmdbid") || has("search", "tmdbid"),
            tv_search_tmdb: has("tv-search", "tmdbid"),
            tv_search_season: has("tv-search", "season"),
            server_title: Some(def.name.clone()),
        }
    }
}

/// The IndexerDbPort implementation: reads/updates the `indexers` table through
/// the host DB pool, so callers avoid depending on this crate directly.
pub struct IndexerDb;

impl kroma_module_sdk::ports::IndexerDbPort for IndexerDb {
    fn list_indexers(
        &self,
        host: &dyn kroma_module_sdk::host::HostCtx,
    ) -> anyhow::Result<Vec<kroma_module_sdk::ports::IndexerRow>> {
        let conn = host.db().get()?;
        Ok(db::list_indexers(&conn)?)
    }

    fn enabled_indexers(
        &self,
        host: &dyn kroma_module_sdk::host::HostCtx,
    ) -> anyhow::Result<Vec<kroma_module_sdk::ports::IndexerRow>> {
        let conn = host.db().get()?;
        Ok(db::enabled_indexers(&conn)?)
    }

    fn get_indexer(
        &self,
        host: &dyn kroma_module_sdk::host::HostCtx,
        id: &str,
    ) -> anyhow::Result<Option<kroma_module_sdk::ports::IndexerRow>> {
        let conn = host.db().get()?;
        Ok(db::get_indexer(&conn, id)?)
    }

    fn note_indexer_result(
        &self,
        host: &dyn kroma_module_sdk::host::HostCtx,
        id: &str,
        ok: bool,
        error: Option<&str>,
        now_ms: i64,
    ) -> anyhow::Result<()> {
        db::note_indexer_result(host.db(), id, ok, error, now_ms)
    }
}

/// The IndexerSearchPort implementation: runs native (Cardigann) searches and
/// resolves grab targets, hiding the stateful `Session` behind the SDK contract shapes.
pub struct IndexerSearch;

impl kroma_module_sdk::ports::IndexerSearchPort for IndexerSearch {
    fn search(
        &self,
        host: &dyn kroma_module_sdk::host::HostCtx,
        row: &kroma_module_sdk::ports::IndexerRow,
        query: &kroma_module_sdk::ports::Query,
        categories: &[u32],
    ) -> anyhow::Result<kroma_module_sdk::ports::SearchOutcome> {
        tracing::info!(
            indexer = %row.name,
            id = %row.id,
            kind = %row.kind,
            categories = ?categories,
            "indexer search",
        );
        if row.kind == admin::KIND_BUILTIN {
            let session = admin::builtin_session(host, row)?;
            let outcome = session.search(&to_native_query(query), categories);
            Ok(kroma_module_sdk::ports::SearchOutcome {
                releases: outcome.releases.into_iter().map(release_to_port).collect(),
                errors: outcome.errors,
            })
        } else {
            // External Torznab endpoint.
            let caps = admin::indexer_caps(host, row)?;
            let endpoint = admin::endpoint_of(row);
            let tz = kroma_module_sdk::ports::torznab(host)
                .ok_or_else(|| anyhow::anyhow!("torznab search engine unavailable"))?;
            let releases = tz.search(&endpoint, query, &caps)?;
            tracing::info!(indexer = %row.name, releases = releases.len(), "torznab answered");
            Ok(kroma_module_sdk::ports::SearchOutcome { releases, errors: Vec::new() })
        }
    }

    fn resolve_download(
        &self,
        host: &dyn kroma_module_sdk::host::HostCtx,
        row: &kroma_module_sdk::ports::IndexerRow,
        title: &str,
        details_url: Option<&str>,
        magnet_or_url: &str,
    ) -> anyhow::Result<kroma_module_sdk::ports::DownloadTarget> {
        if magnet_or_url.starts_with("magnet:") {
            return Ok(kroma_module_sdk::ports::DownloadTarget::Magnet(magnet_or_url.to_string()));
        }
        let session = admin::builtin_session(host, row)?;
        let release = Release {
            title: title.to_string(),
            magnet: magnet_or_url.starts_with("magnet:").then(|| magnet_or_url.to_string()),
            link: magnet_or_url.starts_with("http").then(|| magnet_or_url.to_string()),
            details_url: details_url.map(str::to_string),
            ..Default::default()
        };
        Ok(match session.resolve_download(&release)? {
            DownloadTarget::Magnet(m) => kroma_module_sdk::ports::DownloadTarget::Magnet(m),
            DownloadTarget::TorrentUrl(u) => kroma_module_sdk::ports::DownloadTarget::TorrentUrl(u),
        })
    }
}

fn to_native_query(q: &kroma_module_sdk::ports::Query) -> Query {
    match q {
        kroma_module_sdk::ports::Query::Movie { tmdb_id, imdb_id, title, year } => Query::Movie {
            tmdb_id: *tmdb_id,
            imdb_id: imdb_id.clone(),
            title: title.clone(),
            year: *year,
        },
        kroma_module_sdk::ports::Query::Episode { tmdb_id, title, season, episode } => {
            Query::Episode { tmdb_id: *tmdb_id, title: title.clone(), season: *season, episode: *episode }
        }
        kroma_module_sdk::ports::Query::Season { tmdb_id, title, season } => {
            Query::Season { tmdb_id: *tmdb_id, title: title.clone(), season: *season }
        }
    }
}

fn release_to_port(r: Release) -> kroma_module_sdk::ports::Release {
    kroma_module_sdk::ports::Release {
        title: r.title,
        guid: r.guid,
        link: r.link,
        magnet: r.magnet,
        info_hash: r.info_hash,
        size_bytes: r.size_bytes,
        seeders: r.seeders,
        leechers: r.leechers,
        tmdb_id: r.tmdb_id,
        imdb_id: r.imdb_id,
        published_at: r.published_at,
        details_url: r.details_url,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keywords_render_per_query_kind() {
        assert_eq!(
            Query::Movie { tmdb_id: None, imdb_id: None, title: "Dune".into(), year: Some(2021) }
                .keywords(),
            "Dune 2021"
        );
        assert_eq!(
            Query::Movie { tmdb_id: None, imdb_id: None, title: "Heat".into(), year: None }
                .keywords(),
            "Heat"
        );
        assert_eq!(
            Query::Episode { tmdb_id: None, title: "Breaking Bad".into(), season: 1, episode: 2 }
                .keywords(),
            "Breaking Bad S01E02"
        );
        assert_eq!(
            Query::Season { tmdb_id: None, title: "Breaking Bad".into(), season: 3 }.keywords(),
            "Breaking Bad S03"
        );
        assert_eq!(Query::Text { query: "free text".into() }.keywords(), "free text");
    }

    fn def_with_modes(modes_yaml: &str) -> Definition {
        let yaml = format!(
            r#"
id: t
name: The Tracker
caps:
  modes:
{modes_yaml}
search:
  rows:
    selector: "tr"
"#
        );
        crate::definition::parse(yaml.as_bytes()).unwrap()
    }

    #[test]
    fn caps_from_definition_reads_modes() {
        let def = def_with_modes(
            "    movie-search: [q, imdbid, tmdbid]\n    tv-search: [q, season, tmdbid]",
        );
        let caps = Caps::from_definition(&def);
        assert!(caps.search_imdb);
        assert!(caps.search_tmdb);
        assert!(caps.tv_search_tmdb);
        assert!(caps.tv_search_season);
        assert_eq!(caps.server_title.as_deref(), Some("The Tracker"));
    }

    #[test]
    fn caps_from_definition_search_mode_fallback() {
        let def = def_with_modes("    search: [q, imdbid, tmdbid]");
        let caps = Caps::from_definition(&def);
        assert!(caps.search_imdb && caps.search_tmdb);
        assert!(!caps.tv_search_tmdb && !caps.tv_search_season);
    }

    #[test]
    fn caps_from_definition_no_modes_all_false() {
        let def = def_with_modes("    search: [q]");
        let caps = Caps::from_definition(&def);
        assert!(!caps.search_imdb && !caps.search_tmdb);
        assert!(!caps.tv_search_tmdb && !caps.tv_search_season);
        assert_eq!(caps.server_title.as_deref(), Some("The Tracker"));
    }

    #[test]
    fn to_native_query_maps_all_shapes() {
        use kroma_module_sdk::ports::Query as PQ;
        assert_eq!(
            to_native_query(&PQ::Movie {
                tmdb_id: Some(603),
                imdb_id: Some("tt0133093".into()),
                title: "The Matrix".into(),
                year: Some(1999),
            }),
            Query::Movie {
                tmdb_id: Some(603),
                imdb_id: Some("tt0133093".into()),
                title: "The Matrix".into(),
                year: Some(1999),
            }
        );
        assert_eq!(
            to_native_query(&PQ::Episode {
                tmdb_id: Some(1),
                title: "S".into(),
                season: 2,
                episode: 5,
            }),
            Query::Episode { tmdb_id: Some(1), title: "S".into(), season: 2, episode: 5 }
        );
        assert_eq!(
            to_native_query(&PQ::Season { tmdb_id: None, title: "S".into(), season: 4 }),
            Query::Season { tmdb_id: None, title: "S".into(), season: 4 }
        );
    }

    #[test]
    fn release_to_port_keeps_shared_fields() {
        let r = Release {
            title: "T".into(),
            guid: "g".into(),
            link: Some("l".into()),
            magnet: Some("m".into()),
            info_hash: Some("h".into()),
            size_bytes: Some(5),
            seeders: Some(3),
            leechers: Some(1),
            grabs: Some(9),
            tmdb_id: Some(2),
            imdb_id: Some("tt1".into()),
            published_at: Some("d".into()),
            details_url: Some("u".into()),
            categories: vec![2040],
            download_volume_factor: Some(0.5),
            upload_volume_factor: Some(1.0),
        };
        let p = release_to_port(r);
        assert_eq!(p.title, "T");
        assert_eq!(p.guid, "g");
        assert_eq!(p.link.as_deref(), Some("l"));
        assert_eq!(p.magnet.as_deref(), Some("m"));
        assert_eq!(p.info_hash.as_deref(), Some("h"));
        assert_eq!(p.size_bytes, Some(5));
        assert_eq!(p.seeders, Some(3));
        assert_eq!(p.leechers, Some(1));
        assert_eq!(p.tmdb_id, Some(2));
        assert_eq!(p.imdb_id.as_deref(), Some("tt1"));
        assert_eq!(p.published_at.as_deref(), Some("d"));
        assert_eq!(p.details_url.as_deref(), Some("u"));
    }

    fn port_row() -> kroma_module_sdk::ports::IndexerRow {
        kroma_module_sdk::ports::IndexerRow {
            id: "a".into(),
            name: "N".into(),
            url: "http://x".into(),
            api_key: String::new(),
            categories: vec![2000],
            enabled: true,
            priority: 0,
            kind: admin::KIND_BUILTIN.into(),
            definition_id: Some("def".into()),
            settings: "{}".into(),
            last_ok_at: None,
            last_error: None,
            created_at: 0,
        }
    }

    #[test]
    fn resolve_download_short_circuits_on_magnet_without_touching_host() {
        use kroma_module_sdk::ports::{DownloadTarget, IndexerSearchPort};
        let magnet = "magnet:?xt=urn:btih:deadbeef";
        let out = IndexerSearch
            .resolve_download(&DbHost::new(), &port_row(), "Some Title", None, magnet)
            .expect("magnet resolves without a session");
        assert!(matches!(out, DownloadTarget::Magnet(ref m) if m == magnet), "{out:?}");
    }

    fn db_pool() -> kroma_module_sdk::db::testing::TempPool {
        let pool = kroma_module_sdk::db::testing::temp_pool("indexer-lib");
        {
            let conn = pool.get().unwrap();
            kroma_module_sdk::db::apply_migrations(&conn, db::MIGRATIONS).expect("indexers schema");
        }
        pool
    }

    type DbHost = kroma_module_sdk::host::testing::StubHost;

    fn seed_row(id: &str, kind: &str, enabled: bool, created_at: i64) -> kroma_module_sdk::ports::IndexerRow {
        let mut r = port_row();
        r.id = id.into();
        r.kind = kind.into();
        r.enabled = enabled;
        r.created_at = created_at;
        r
    }

    #[test]
    fn indexer_db_port_lists_gets_and_notes_against_a_real_db() {
        use kroma_module_sdk::ports::IndexerDbPort;
        let pool = db_pool();
        db::insert_indexer(&pool, &seed_row("a", admin::KIND_BUILTIN, true, 100)).unwrap();
        db::insert_indexer(&pool, &seed_row("b", "torznab", false, 200)).unwrap();
        let host = DbHost::with_pool(pool.clone());

        assert_eq!(IndexerDb.list_indexers(&host).unwrap().len(), 2);
        assert_eq!(IndexerDb.get_indexer(&host, "a").unwrap().unwrap().id, "a");
        assert!(IndexerDb.get_indexer(&host, "ghost").unwrap().is_none());
        let enabled = IndexerDb.enabled_indexers(&host).unwrap();
        assert_eq!(enabled.len(), 1);
        assert_eq!(enabled[0].id, "a");
        IndexerDb.note_indexer_result(&host, "a", true, None, 4242).unwrap();
        assert_eq!(IndexerDb.get_indexer(&host, "a").unwrap().unwrap().last_ok_at, Some(4242));
    }

    #[test]
    fn torrent_fetch_returns_none_for_unknown_or_non_builtin_indexer() {
        use kroma_module_sdk::ports::TorrentFetchPort;
        let pool = db_pool();
        db::insert_indexer(&pool, &seed_row("tz", "torznab", true, 100)).unwrap();
        let host = DbHost::with_pool(pool.clone());
        assert!(IndexerTorrentFetch.fetch_torrent(&host, "nope", "http://x/f.torrent").is_none());
        assert!(IndexerTorrentFetch.fetch_torrent(&host, "tz", "http://x/f.torrent").is_none());
    }

    fn port_query() -> kroma_module_sdk::ports::Query {
        kroma_module_sdk::ports::Query::Movie {
            tmdb_id: Some(603),
            imdb_id: None,
            title: "The Matrix".into(),
            year: Some(1999),
        }
    }

    #[test]
    fn the_module_declares_its_id_migrations_and_admin_routes() {
        let pool = db_pool();
        let host = DbHost::with_pool(pool.clone());
        let module = server_module::<DbHost>();
        // The id is the manifest id: the host keys enable/disable state on it, so
        // a drift here silently detaches every stored setting.
        assert_eq!(module.id(), MODULE_ID);
        assert_eq!(module.id(), "tv.kroma.indexer");
        // The module owns its own tables; without this the host applies nothing
        // and every query fails at runtime rather than at install.
        assert_eq!(module.migrations(), db::MIGRATIONS);
        assert!(!db::MIGRATIONS.trim().is_empty());
        assert!(module.admin_routes(&host).is_some(), "the admin UI has nowhere to talk to");
    }

    #[test]
    fn a_torznab_search_without_the_torznab_engine_names_the_missing_piece() {
        // A disabled engine's failure must be recorded on the indexer row,
        // because that is where the admin looks when results stop coming.
        use kroma_module_sdk::ports::IndexerSearchPort;
        let pool = db_pool();
        let mut row = seed_row("tz-no-engine", "torznab", true, 100);
        row.url = "http://tracker.invalid/api".into();
        db::insert_indexer(&pool, &row).unwrap();
        let host = DbHost::with_pool(pool.clone());

        let err = IndexerSearch
            .search(&host, &row, &port_query(), &[2000])
            .unwrap_err()
            .to_string();
        assert!(err.contains("torznab search engine unavailable"), "{err}");

        let stored = db::get_indexer(&pool.get().unwrap(), "tz-no-engine").unwrap().unwrap();
        assert_eq!(stored.last_ok_at, None);
        assert!(
            stored.last_error.as_deref().unwrap_or_default().contains("torznab"),
            "the failure was not recorded on the row: {:?}",
            stored.last_error
        );
    }

    struct FakeTorznab;

    impl kroma_module_sdk::ports::TorznabPort for FakeTorznab {
        fn caps(
            &self,
            endpoint: &kroma_module_sdk::ports::IndexerEndpoint,
        ) -> anyhow::Result<kroma_module_sdk::ports::Caps> {
            Ok(kroma_module_sdk::ports::Caps {
                search_tmdb: true,
                search_imdb: false,
                tv_search_tmdb: false,
                server_title: Some(endpoint.url.clone()),
            })
        }

        fn search(
            &self,
            endpoint: &kroma_module_sdk::ports::IndexerEndpoint,
            _query: &kroma_module_sdk::ports::Query,
            caps: &kroma_module_sdk::ports::Caps,
        ) -> anyhow::Result<Vec<kroma_module_sdk::ports::Release>> {
            assert!(caps.search_tmdb, "the caps probe result must reach the search call");
            Ok(vec![kroma_module_sdk::ports::Release {
                title: "From The Endpoint".into(),
                guid: endpoint.url.clone(),
                ..Default::default()
            }])
        }
    }

    // The engine is reached over the `torznab` contract, so the fake is SERVED
    // on a real localhost port and the host is pointed at it.
    #[tokio::test]
    async fn a_torznab_search_goes_out_through_the_resolved_engine() {
        use kroma_module_sdk::ports::{torznab_routes, IndexerSearchPort, TorznabPort};
        let pool = db_pool();
        let mut row = seed_row("tz-engine", "torznab", true, 100);
        row.url = "http://tracker.example/api".into();
        db::insert_indexer(&pool, &row).unwrap();
        let port: std::sync::Arc<dyn TorznabPort> = std::sync::Arc::new(FakeTorznab);
        let resolve =
            kroma_module_sdk::testing::serve(torznab_routes::<()>(port), ()).await;
        let (base, token) = resolve().expect("the fake provider is up");
        let host = DbHost::with_pool(pool.clone()).with_port(
            kroma_module_sdk::ports::TORZNAB,
            &base,
            &token,
        );

        let (host, row) = (host, row);
        let outcome = kroma_module_sdk::testing::blocking(move || {
            IndexerSearch.search(&host, &row, &port_query(), &[2000]).map(|o| (o, host))
        })
        .await
        .unwrap();
        let (outcome, host) = outcome;
        let _ = &host;
        assert!(outcome.errors.is_empty());
        assert_eq!(outcome.releases.len(), 1);
        assert_eq!(outcome.releases[0].title, "From The Endpoint");
        assert_eq!(outcome.releases[0].guid, "http://tracker.example/api");

        let stored = db::get_indexer(&pool.get().unwrap(), "tz-engine").unwrap().unwrap();
        assert!(stored.last_ok_at.is_some(), "a successful probe must clear the row's error state");
        assert_eq!(stored.last_error, None);
    }

    #[test]
    fn a_builtin_search_for_a_definition_that_is_not_installed_fails_loudly() {
        // A row can outlive its Cardigann definition; erroring beats reporting
        // "no results", which reads as "nothing to grab".
        use kroma_module_sdk::ports::IndexerSearchPort;
        let pool = db_pool();
        let mut row = seed_row("builtin-gone", admin::KIND_BUILTIN, true, 100);
        row.definition_id = Some("a-tracker-that-does-not-exist".into());
        db::insert_indexer(&pool, &row).unwrap();
        let host = DbHost::with_pool(pool.clone());

        assert!(IndexerSearch.search(&host, &row, &port_query(), &[2000]).is_err());
    }

    #[test]
    fn resolving_a_plain_url_needs_the_indexers_session() {
        // Cookie-gated, unlike a magnet: a session failure must surface rather
        // than hand back an unauthenticated URL that downloads an HTML login page.
        use kroma_module_sdk::ports::IndexerSearchPort;
        let pool = db_pool();
        let mut row = seed_row("builtin-nodef", admin::KIND_BUILTIN, true, 100);
        row.definition_id = Some("also-missing".into());
        db::insert_indexer(&pool, &row).unwrap();
        let host = DbHost::with_pool(pool.clone());

        assert!(IndexerSearch
            .resolve_download(&host, &row, "Some.Release", None, "http://tracker.invalid/dl/1")
            .is_err());
    }

    #[test]
    fn fetching_a_torrent_from_a_builtin_indexer_reports_a_session_failure() {
        // A built-in row IS cookie-gated, so the caller must not silently fall
        // back to a plain fetch on a session failure.
        use kroma_module_sdk::ports::TorrentFetchPort;
        let pool = db_pool();
        let mut row = seed_row("builtin-fetch", admin::KIND_BUILTIN, true, 100);
        row.definition_id = Some("nowhere-to-be-found".into());
        db::insert_indexer(&pool, &row).unwrap();
        let host = DbHost::with_pool(pool.clone());

        let outcome = IndexerTorrentFetch.fetch_torrent(&host, "builtin-fetch", "http://x/f.torrent");
        assert!(matches!(outcome, Some(Err(_))), "a built-in grab must not degrade to a plain fetch");
    }

    #[test]
    fn a_grab_whose_database_is_gone_reports_the_failure_instead_of_no_such_indexer() {
        use kroma_module_sdk::ports::TorrentFetchPort;
        let dir = kroma_testing::temp_dir("indexer-lib-nopool");
        let pool = kroma_module_sdk::db::init(&dir.path().join("kroma.db")).unwrap();
        let held = pool.get().unwrap();
        std::fs::remove_dir_all(dir.path()).unwrap();
        let host = DbHost::with_pool(pool.clone());

        let outcome = IndexerTorrentFetch.fetch_torrent(&host, "any", "http://x/f.torrent");

        assert!(matches!(outcome, Some(Err(_))));
        drop(held);
    }

    #[test]
    fn a_grab_whose_indexers_table_is_gone_reports_the_failure() {
        use kroma_module_sdk::ports::TorrentFetchPort;
        let pool = db_pool();
        pool.get().unwrap().execute_batch("DROP TABLE indexers").unwrap();
        let host = DbHost::with_pool(pool.clone());

        let outcome = IndexerTorrentFetch.fetch_torrent(&host, "any", "http://x/f.torrent");

        assert!(matches!(outcome, Some(Err(_))));
    }

    const SEARCH_DEF: &str = r#"
id: local
name: Local Tracker
caps:
  modes:
    search: [q]
search:
  paths:
    - path: /search
  rows:
    selector: "tr.r"
  fields:
    title:
      selector: "td.title"
    guid:
      selector: "td.title"
"#;

    const DOWNLOAD_DEF: &str = r#"
id: local
name: Local Tracker
caps:
  modes:
    search: [q]
search:
  rows:
    selector: "tr.r"
download:
  selectors:
    - selector: "a.dl"
      attribute: href
"#;

    fn serve(body: &'static [u8], content_type: &'static str) -> String {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                use std::io::{BufRead as _, Write as _};
                let Ok(mut stream) = stream else { break };
                let mut reader = std::io::BufReader::new(stream.try_clone().unwrap());
                loop {
                    let mut line = String::new();
                    if reader.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" {
                        break;
                    }
                }
                let head = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: {content_type}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                let _ = stream.write_all(head.as_bytes());
                let _ = stream.write_all(body);
                let _ = stream.flush();
            }
        });
        format!("http://127.0.0.1:{port}")
    }

    fn install_definition(host: &DbHost, id: &str, yaml: &str) {
        use kroma_module_sdk::host::HostCtx as _;
        let dir = host.data_dir().join("indexer-defs");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(format!("{id}.yml")), yaml).unwrap();
    }

    fn builtin_row(id: &str, definition_id: &str, url: String) -> kroma_module_sdk::ports::IndexerRow {
        let mut row = seed_row(id, admin::KIND_BUILTIN, true, 100);
        row.definition_id = Some(definition_id.into());
        row.url = url;
        row
    }

    #[test]
    fn a_builtin_search_runs_the_definition_and_hands_back_the_rows_it_parsed() {
        use kroma_module_sdk::ports::IndexerSearchPort;
        let host = DbHost::new();
        install_definition(&host, "search-def", SEARCH_DEF);
        let row = builtin_row(
            "builtin-search",
            "search-def",
            serve(
                br#"<table><tr class="r"><td class="title">The.Matrix.1999.1080p</td></tr></table>"#,
                "text/html",
            ),
        );

        let outcome = IndexerSearch.search(&host, &row, &port_query(), &[2000]).unwrap();

        assert!(outcome.errors.is_empty(), "{:?}", outcome.errors);
        assert_eq!(outcome.releases.len(), 1);
        assert_eq!(outcome.releases[0].title, "The.Matrix.1999.1080p");
    }

    #[test]
    fn a_details_page_that_only_carries_a_magnet_resolves_to_that_magnet() {
        use kroma_module_sdk::ports::{DownloadTarget, IndexerSearchPort};
        let host = DbHost::new();
        install_definition(&host, "download-def", DOWNLOAD_DEF);
        let base = serve(
            br#"<html><body><a class="dl" href="magnet:?xt=urn:btih:cafebabe">grab</a></body></html>"#,
            "text/html",
        );
        let details = format!("{base}/details/1");
        let row = builtin_row("builtin-details", "download-def", base);

        let out = IndexerSearch
            .resolve_download(&host, &row, "Some.Release", Some(&details), &details)
            .unwrap();

        assert!(
            matches!(out, DownloadTarget::Magnet(ref m) if m == "magnet:?xt=urn:btih:cafebabe"),
            "{out:?}"
        );
    }

    #[test]
    fn a_definition_with_no_download_rule_hands_the_url_back_untouched() {
        use kroma_module_sdk::ports::{DownloadTarget, IndexerSearchPort};
        let host = DbHost::new();
        install_definition(&host, "search-def", SEARCH_DEF);
        let row = builtin_row("builtin-plain", "search-def", "http://tracker.invalid".into());

        let out = IndexerSearch
            .resolve_download(&host, &row, "Some.Release", None, "http://tracker.invalid/dl/1")
            .unwrap();

        assert!(
            matches!(out, DownloadTarget::TorrentUrl(ref u) if u == "http://tracker.invalid/dl/1"),
            "{out:?}"
        );
    }

    #[test]
    fn a_builtin_grab_goes_out_through_the_indexers_own_session() {
        use kroma_module_sdk::ports::TorrentFetchPort;
        let pool = db_pool();
        let base = serve(b"d8:announce9:udp://x:0e", "application/x-bittorrent");
        let row = builtin_row("builtin-ok", "search-def", base.clone());
        db::insert_indexer(&pool, &row).unwrap();
        let host = DbHost::with_pool(pool.clone());
        install_definition(&host, "search-def", SEARCH_DEF);

        let bytes = IndexerTorrentFetch
            .fetch_torrent(&host, "builtin-ok", &format!("{base}/dl/1.torrent"))
            .expect("a built-in row is this port's to answer")
            .expect("the fake tracker served the file");

        assert_eq!(bytes, b"d8:announce9:udp://x:0e");
    }
}
