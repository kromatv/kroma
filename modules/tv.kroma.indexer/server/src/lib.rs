//! Native Cardigann indexer engine: runs Cardigann YAML tracker definitions
//! directly, as an alternative to Torznab/Jackett/Prowlarr. Definitions are
//! GPL and fetched at runtime by [`store`], not vendored into this MIT repo.

use serde::{Deserialize, Serialize};

pub mod admin;
pub mod category;
pub mod context;
pub mod db;
pub mod definition;
pub mod dtos;
pub mod engine;
pub mod filters;
pub mod module;
pub mod peers;
pub mod port;
pub mod routes;
pub mod search;
pub mod selector;
pub mod session;
pub mod store;
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
impl<S: kroma_module_sdk::host::HostStorage + Clone + Send + Sync + 'static>
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
pub fn server_module<S: kroma_module_sdk::host::HostStorage + Clone + Send + Sync + 'static>(
) -> Box<dyn kroma_module_sdk::host::ServerModule<S>> {
    Box::new(IndexersModule)
}

/// A configured built-in indexer: the chosen base link plus admin-entered
/// settings (`.Config.<name>` resolves against this, falling back to definition defaults).
#[derive(Debug, Clone, Default)]
pub struct IndexerConfig {
    pub base_url: String,
    pub settings: std::collections::HashMap<String, String>,
}

/// One search request, for either engine. `Text` is the native engine's own: the
/// `torznab` point has no free-text variant, so [`peers`] maps it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Query {
    Movie {
        tmdb_id: Option<u64>,
        imdb_id: Option<String>,
        title: String,
        year: Option<u32>,
    },
    Episode {
        tmdb_id: Option<u64>,
        title: String,
        season: u32,
        episode: u32,
    },
    Season {
        tmdb_id: Option<u64>,
        title: String,
        season: u32,
    },
    Text {
        query: String,
    },
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
            Query::Episode {
                title,
                season,
                episode,
                ..
            } => {
                format!("{title} S{season:02}E{episode:02}")
            }
            Query::Season { title, season, .. } => format!("{title} S{season:02}"),
            Query::Text { query } => query.clone(),
        }
    }
}

/// A normalized release: the fields every engine reports plus the richer
/// attributes Cardigann exposes (categories, freeleech factors).
///
/// Tolerant on purpose. It carries answers from the `torznab` point, whose
/// provider is a separately released module that knows nothing of the extra
/// fields, so a missing one has to default rather than fail the whole search.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
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

/// What an indexer advertises it can do: derived from `caps.modes` for a
/// definition, read off the `torznab` point for an external endpoint. Serde
/// because it crosses that point, and tolerant because the two ends version
/// apart.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
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
            def.caps
                .modes
                .get(mode)
                .is_some_and(|params| params.iter().any(|p| p == param))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keywords_render_per_query_kind() {
        assert_eq!(
            Query::Movie {
                tmdb_id: None,
                imdb_id: None,
                title: "Dune".into(),
                year: Some(2021)
            }
            .keywords(),
            "Dune 2021"
        );
        assert_eq!(
            Query::Movie {
                tmdb_id: None,
                imdb_id: None,
                title: "Heat".into(),
                year: None
            }
            .keywords(),
            "Heat"
        );
        assert_eq!(
            Query::Episode {
                tmdb_id: None,
                title: "Breaking Bad".into(),
                season: 1,
                episode: 2
            }
            .keywords(),
            "Breaking Bad S01E02"
        );
        assert_eq!(
            Query::Season {
                tmdb_id: None,
                title: "Breaking Bad".into(),
                season: 3
            }
            .keywords(),
            "Breaking Bad S03"
        );
        assert_eq!(
            Query::Text {
                query: "free text".into()
            }
            .keywords(),
            "free text"
        );
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

    fn port_row() -> db::IndexerRow {
        db::IndexerRow {
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
        use port::DownloadTarget;
        let magnet = "magnet:?xt=urn:btih:deadbeef";
        let out = search::resolve_download(&DbHost::new(), &port_row(), "Some Title", None, magnet)
            .expect("magnet resolves without a session");
        assert!(
            matches!(out, DownloadTarget::Magnet(ref m) if m == magnet),
            "{out:?}"
        );
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

    fn seed_row(id: &str, kind: &str, enabled: bool, created_at: i64) -> db::IndexerRow {
        let mut r = port_row();
        r.id = id.into();
        r.kind = kind.into();
        r.enabled = enabled;
        r.created_at = created_at;
        r
    }

    #[test]
    fn indexer_db_port_lists_gets_and_notes_against_a_real_db() {
        let pool = db_pool();
        db::insert_indexer(&pool, &seed_row("a", admin::KIND_BUILTIN, true, 100)).unwrap();
        db::insert_indexer(&pool, &seed_row("b", "torznab", false, 200)).unwrap();
        let conn = pool.get().unwrap();

        assert_eq!(db::list_indexers(&conn).unwrap().len(), 2);
        assert_eq!(db::get_indexer(&conn, "a").unwrap().unwrap().id, "a");
        assert!(db::get_indexer(&conn, "ghost").unwrap().is_none());
        let enabled = db::enabled_indexers(&conn).unwrap();
        assert_eq!(enabled.len(), 1);
        assert_eq!(enabled[0].id, "a");
        drop(conn);
        db::note_indexer_result(&pool, "a", true, None, 4242).unwrap();
        let conn = pool.get().unwrap();
        assert_eq!(
            db::get_indexer(&conn, "a").unwrap().unwrap().last_ok_at,
            Some(4242)
        );
    }

    #[test]
    fn torrent_fetch_returns_none_for_unknown_or_non_builtin_indexer() {
        let pool = db_pool();
        db::insert_indexer(&pool, &seed_row("tz", "torznab", true, 100)).unwrap();
        let host = DbHost::with_store(pool.clone());

        // Neither needs this module's authenticated session, so the caller does a
        // plain fetch: `None`, not an error.
        assert_eq!(
            search::fetch_torrent(&host, "nope", "http://x/f.torrent").unwrap(),
            None
        );
        assert_eq!(
            search::fetch_torrent(&host, "tz", "http://x/f.torrent").unwrap(),
            None
        );
    }

    fn port_query() -> Query {
        Query::Movie {
            tmdb_id: Some(603),
            imdb_id: None,
            title: "The Matrix".into(),
            year: Some(1999),
        }
    }

    #[test]
    fn the_module_declares_its_id_migrations_and_admin_routes() {
        let pool = db_pool();
        let host = DbHost::with_store(pool.clone());
        let module = server_module::<DbHost>();
        // The id is the manifest id: the host keys enable/disable state on it, so
        // a drift here silently detaches every stored setting.
        assert_eq!(module.id(), MODULE_ID);
        assert_eq!(module.id(), "tv.kroma.indexer");
        // The module owns its own tables; without this the host applies nothing
        // and every query fails at runtime rather than at install.
        assert_eq!(module.migrations(), db::MIGRATIONS);
        assert!(!db::MIGRATIONS.trim().is_empty());
        assert!(
            module.admin_routes(&host).is_some(),
            "the admin UI has nowhere to talk to"
        );
    }

    #[test]
    fn a_torznab_search_without_the_torznab_engine_names_the_missing_piece() {
        // A disabled engine's failure must be recorded on the indexer row,
        // because that is where the admin looks when results stop coming.
        let pool = db_pool();
        let mut row = seed_row("tz-no-engine", "torznab", true, 100);
        row.url = "http://tracker.invalid/api".into();
        db::insert_indexer(&pool, &row).unwrap();
        let host = DbHost::with_store(pool.clone());

        let err = search::run(&host, &row, &port_query(), &[2000])
            .unwrap_err()
            .to_string();
        assert!(
            err.contains("no module answers tv.kroma.indexer/engine as torznab"),
            "{err}"
        );

        let stored = db::get_indexer(&pool.get().unwrap(), "tz-no-engine")
            .unwrap()
            .unwrap();
        assert_eq!(stored.last_ok_at, None);
        assert!(
            stored
                .last_error
                .as_deref()
                .unwrap_or_default()
                .contains("torznab"),
            "the failure was not recorded on the row: {:?}",
            stored.last_error
        );
    }

    // The engine is reached over this module's own point, so the fake is SERVED
    // on a real localhost port and the host is pointed at it. It parses the
    // request with its own structs, exactly as a real contributor does.
    fn fake_torznab() -> axum::Router<()> {
        use axum::routing::post;
        use axum::Json;
        use serde_json::{json, Value};

        async fn caps(Json(endpoint): Json<Value>) -> Json<Result<Value, String>> {
            let url = endpoint["url"].as_str().unwrap_or_default().to_string();
            Json(Ok(json!({ "search_tmdb": true, "server_title": url })))
        }

        async fn search(Json(req): Json<Value>) -> Json<Result<Vec<Value>, String>> {
            assert_eq!(
                req["caps"]["search_tmdb"], true,
                "the caps probe result must reach the search call"
            );
            let url = req["endpoint"]["url"]
                .as_str()
                .unwrap_or_default()
                .to_string();
            assert!(
                req["query"]["Movie"].is_object(),
                "the query crossed as {:?}",
                req["query"]
            );
            Json(Ok(vec![
                json!({ "title": "From The Endpoint", "guid": url }),
            ]))
        }

        axum::Router::new()
            .route("/_port/tv.kroma.indexer/engine/caps", post(caps))
            .route("/_port/tv.kroma.indexer/engine/search", post(search))
    }

    #[tokio::test]
    async fn a_row_of_a_kind_this_module_never_heard_of_reaches_its_contributor() {
        let pool = db_pool();
        let mut row = seed_row("pl-1", "prowlarr", true, 100);
        row.url = "http://prowlarr.example/api".into();
        db::insert_indexer(&pool, &row).unwrap();
        let resolve = kroma_module_host::test_serve::serve(fake_torznab(), ()).await;
        let (base, token) = resolve().expect("the fake engine is up");
        let host = DbHost::with_store(pool.clone()).with_point(
            peers::ENGINE,
            Some("prowlarr"),
            &base,
            &token,
        );

        let outcome = kroma_module_host::test_serve::blocking(move || {
            search::run(&host, &row, &port_query(), &[2000])
        })
        .await
        .unwrap();

        assert_eq!(outcome.releases.len(), 1);
        assert_eq!(outcome.releases[0].guid, "http://prowlarr.example/api");
    }

    #[tokio::test]
    async fn a_torznab_search_goes_out_through_the_resolved_provider() {
        let pool = db_pool();
        let mut row = seed_row("tz-engine", "torznab", true, 100);
        row.url = "http://tracker.example/api".into();
        db::insert_indexer(&pool, &row).unwrap();
        let resolve = kroma_module_host::test_serve::serve(fake_torznab(), ()).await;
        let (base, token) = resolve().expect("the fake provider is up");
        let host = DbHost::with_store(pool.clone()).with_point(
            peers::ENGINE,
            Some("torznab"),
            &base,
            &token,
        );

        let outcome = kroma_module_host::test_serve::blocking(move || {
            search::run(&host, &row, &port_query(), &[2000])
        })
        .await
        .unwrap();

        assert!(outcome.errors.is_empty());
        assert_eq!(outcome.releases.len(), 1);
        assert_eq!(outcome.releases[0].title, "From The Endpoint");
        assert_eq!(outcome.releases[0].guid, "http://tracker.example/api");

        let stored = db::get_indexer(&pool.get().unwrap(), "tz-engine")
            .unwrap()
            .unwrap();
        assert!(
            stored.last_ok_at.is_some(),
            "a successful probe must clear the row's error state"
        );
        assert_eq!(stored.last_error, None);
    }

    #[test]
    fn a_builtin_search_for_a_definition_that_is_not_installed_fails_loudly() {
        // A row can outlive its Cardigann definition; erroring beats reporting
        // "no results", which reads as "nothing to grab".
        let pool = db_pool();
        let mut row = seed_row("builtin-gone", admin::KIND_BUILTIN, true, 100);
        row.definition_id = Some("a-tracker-that-does-not-exist".into());
        db::insert_indexer(&pool, &row).unwrap();
        let host = DbHost::with_store(pool.clone());

        assert!(search::run(&host, &row, &port_query(), &[2000]).is_err());
    }

    #[test]
    fn resolving_a_plain_url_needs_the_indexers_session() {
        // Cookie-gated, unlike a magnet: a session failure must surface rather
        // than hand back an unauthenticated URL that downloads an HTML login page.
        let pool = db_pool();
        let mut row = seed_row("builtin-nodef", admin::KIND_BUILTIN, true, 100);
        row.definition_id = Some("also-missing".into());
        db::insert_indexer(&pool, &row).unwrap();
        let host = DbHost::with_store(pool.clone());

        assert!(search::resolve_download(
            &host,
            &row,
            "Some.Release",
            None,
            "http://tracker.invalid/dl/1"
        )
        .is_err());
    }

    #[test]
    fn fetching_a_torrent_from_a_builtin_indexer_reports_a_session_failure() {
        // A built-in row IS cookie-gated, so the caller must not silently fall
        // back to a plain fetch on a session failure.
        let pool = db_pool();
        let mut row = seed_row("builtin-fetch", admin::KIND_BUILTIN, true, 100);
        row.definition_id = Some("nowhere-to-be-found".into());
        db::insert_indexer(&pool, &row).unwrap();
        let host = DbHost::with_store(pool.clone());

        let outcome = search::fetch_torrent(&host, "builtin-fetch", "http://x/f.torrent");
        assert!(
            outcome.is_err(),
            "a built-in grab must not degrade to a plain fetch"
        );
    }

    #[test]
    fn a_grab_whose_database_is_gone_reports_the_failure_instead_of_no_such_indexer() {
        let dir = kroma_testing::temp_dir("indexer-lib-nopool");
        let pool = kroma_module_sdk::db::init(&dir.path().join("kroma.db")).unwrap();
        let held = pool.get().unwrap();
        std::fs::remove_dir_all(dir.path()).unwrap();
        let host = DbHost::with_store(pool.clone());

        let outcome = search::fetch_torrent(&host, "any", "http://x/f.torrent");

        assert!(outcome.is_err());
        drop(held);
    }

    #[test]
    fn a_grab_whose_indexers_table_is_gone_reports_the_failure() {
        let pool = db_pool();
        pool.get()
            .unwrap()
            .execute_batch("DROP TABLE indexers")
            .unwrap();
        let host = DbHost::with_store(pool.clone());

        let outcome = search::fetch_torrent(&host, "any", "http://x/f.torrent");

        assert!(outcome.is_err());
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

    fn builtin_row(id: &str, definition_id: &str, url: String) -> db::IndexerRow {
        let mut row = seed_row(id, admin::KIND_BUILTIN, true, 100);
        row.definition_id = Some(definition_id.into());
        row.url = url;
        row
    }

    #[test]
    fn a_builtin_search_runs_the_definition_and_hands_back_the_rows_it_parsed() {
        let pool = db_pool();
        let host = DbHost::with_store(pool.clone());
        install_definition(&host, "search-def", SEARCH_DEF);
        let row = builtin_row(
            "builtin-search",
            "search-def",
            serve(
                br#"<table><tr class="r"><td class="title">The.Matrix.1999.1080p</td></tr></table>"#,
                "text/html",
            ),
        );

        let outcome = search::run(&host, &row, &port_query(), &[2000]).unwrap();

        assert!(outcome.errors.is_empty(), "{:?}", outcome.errors);
        assert_eq!(outcome.releases.len(), 1);
        assert_eq!(outcome.releases[0].title, "The.Matrix.1999.1080p");
    }

    #[test]
    fn a_details_page_that_only_carries_a_magnet_resolves_to_that_magnet() {
        use port::DownloadTarget;
        let pool = db_pool();
        let host = DbHost::with_store(pool.clone());
        install_definition(&host, "download-def", DOWNLOAD_DEF);
        let base = serve(
            br#"<html><body><a class="dl" href="magnet:?xt=urn:btih:cafebabe">grab</a></body></html>"#,
            "text/html",
        );
        let details = format!("{base}/details/1");
        let row = builtin_row("builtin-details", "download-def", base);

        let out = search::resolve_download(&host, &row, "Some.Release", Some(&details), &details)
            .unwrap();

        assert!(
            matches!(out, DownloadTarget::Magnet(ref m) if m == "magnet:?xt=urn:btih:cafebabe"),
            "{out:?}"
        );
    }

    #[test]
    fn a_definition_with_no_download_rule_hands_the_url_back_untouched() {
        use port::DownloadTarget;
        let pool = db_pool();
        let host = DbHost::with_store(pool.clone());
        install_definition(&host, "search-def", SEARCH_DEF);
        let row = builtin_row(
            "builtin-plain",
            "search-def",
            "http://tracker.invalid".into(),
        );

        let out = search::resolve_download(
            &host,
            &row,
            "Some.Release",
            None,
            "http://tracker.invalid/dl/1",
        )
        .unwrap();

        assert!(
            matches!(out, DownloadTarget::TorrentUrl(ref u) if u == "http://tracker.invalid/dl/1"),
            "{out:?}"
        );
    }

    #[test]
    fn a_builtin_grab_goes_out_through_the_indexers_own_session() {
        let pool = db_pool();
        let base = serve(b"d8:announce9:udp://x:0e", "application/x-bittorrent");
        let row = builtin_row("builtin-ok", "search-def", base.clone());
        db::insert_indexer(&pool, &row).unwrap();
        let host = DbHost::with_store(pool.clone());
        install_definition(&host, "search-def", SEARCH_DEF);

        let bytes = search::fetch_torrent(&host, "builtin-ok", &format!("{base}/dl/1.torrent"))
            .expect("a built-in row is this port's to answer")
            .expect("the fake tracker served the file");

        assert_eq!(bytes, b"d8:announce9:udp://x:0e");
    }
}
