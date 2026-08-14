//! Torznab client: the Newznab-derived HTTP/XML API spoken by Jackett and
//! Prowlarr, which is how KROMA searches torrent indexers without knowing any
//! tracker's private dialect. One [`IndexerEndpoint`] per configured indexer;
//! [`search`] normalizes the RSS answer into [`Release`]s for the decision
//! engine (`kroma-scene`), and [`caps`] doubles as the test-connection call.
//!
//! The public surface is stable from day one; the transport + XML parsing land
//! with the indexer milestone.

// The Torznab types now live in the SDK ports module (kroma_module_sdk::ports) (so indexer / acquisition use
// them without depending on this crate); re-exported here for this crate's fns.
pub use kroma_module_sdk::ports::{
    Caps, IndexerEndpoint, Query, Release, CAT_MOVIES, CAT_TV,
};

mod xml;

// Network budget per Torznab call: trackers behind Jackett can be slow.
const MAX_TIME_SECS: u32 = 40;

fn fetch_xml(endpoint: &IndexerEndpoint, params: &[(&str, String)]) -> anyhow::Result<Vec<u8>> {
    let mut req = kroma_module_sdk::http::Fetch::new().max_time(MAX_TIME_SECS);
    if !endpoint.api_key.is_empty() {
        req = req.query("apikey", endpoint.api_key.clone());
    }
    for (k, v) in params {
        req = req.query(k, v.clone());
    }
    Ok(req.get(&endpoint.url)?.ensure_ok()?.body)
}

/// Fetch `t=caps` (also the admin test-connection call).
pub fn caps(endpoint: &IndexerEndpoint) -> anyhow::Result<Caps> {
    let body = fetch_xml(endpoint, &[("t", "caps".to_string())])?;
    xml::parse_caps(&body)
}

/// Run one query against one indexer and normalize the results.
///
/// Attempts the strongest parameter set the indexer supports first (tmdb id,
/// then imdb id, then a structured `tvsearch`, then free text) and falls back on
/// an empty answer: not every tracker behind Jackett resolves external ids, and
/// an id miss must not hide releases a text query would find.
pub fn search(endpoint: &IndexerEndpoint, query: &Query, caps: &Caps) -> anyhow::Result<Vec<Release>> {
    let cats = endpoint
        .categories
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let mut last_err: Option<anyhow::Error> = None;
    for mut params in attempts(query, caps) {
        if !cats.is_empty() {
            params.push(("cat", cats.clone()));
        }
        match fetch_xml(endpoint, &params).and_then(|body| xml::parse_items(&body)) {
            Ok(items) if !items.is_empty() => return Ok(items),
            Ok(_) => {}
            Err(e) => last_err = Some(e),
        }
    }
    match last_err {
        // Every attempt errored: surface it (auth/network problems must not
        // read as "no releases found").
        Some(e) => Err(e),
        None => Ok(Vec::new()),
    }
}

// The ordered parameter sets to try for a query, strongest first.
fn attempts(query: &Query, caps: &Caps) -> Vec<Vec<(&'static str, String)>> {
    match query {
        Query::Movie { tmdb_id, imdb_id, title, year } => {
            movie_attempts(caps, *tmdb_id, imdb_id.as_deref(), title, *year)
        }
        Query::Episode { tmdb_id, title, season, episode } => {
            episode_attempts(caps, *tmdb_id, title, *season, *episode)
        }
        Query::Season { tmdb_id, title, season } => season_attempts(caps, *tmdb_id, title, *season),
    }
}

fn movie_attempts(
    caps: &Caps,
    tmdb_id: Option<u64>,
    imdb_id: Option<&str>,
    title: &str,
    year: Option<u32>,
) -> Vec<Vec<(&'static str, String)>> {
    let mut out: Vec<Vec<(&'static str, String)>> = Vec::new();
    if caps.search_tmdb {
        if let Some(id) = tmdb_id {
            out.push(vec![("t", "movie".into()), ("tmdbid", id.to_string())]);
        }
    }
    if caps.search_imdb {
        if let Some(imdb) = imdb_id {
            // Torznab wants the bare number, without the tt prefix.
            let bare = imdb.trim_start_matches("tt").to_string();
            out.push(vec![("t", "movie".into()), ("imdbid", bare)]);
        }
    }
    let q = match year {
        Some(y) => format!("{title} {y}"),
        None => title.to_string(),
    };
    out.push(vec![("t", "search".into()), ("q", q)]);
    out
}

fn episode_attempts(
    caps: &Caps,
    tmdb_id: Option<u64>,
    title: &str,
    season: u32,
    episode: u32,
) -> Vec<Vec<(&'static str, String)>> {
    let mut out: Vec<Vec<(&'static str, String)>> = Vec::new();
    if caps.tv_search_tmdb {
        if let Some(id) = tmdb_id {
            out.push(vec![
                ("t", "tvsearch".into()),
                ("tmdbid", id.to_string()),
                ("season", season.to_string()),
                ("ep", episode.to_string()),
            ]);
        }
    }
    if caps.tv_search_season {
        out.push(vec![
            ("t", "tvsearch".into()),
            ("q", title.to_string()),
            ("season", season.to_string()),
            ("ep", episode.to_string()),
        ]);
    }
    out.push(vec![
        ("t", "search".into()),
        ("q", format!("{title} S{season:02}E{episode:02}")),
    ]);
    out
}

fn season_attempts(
    caps: &Caps,
    tmdb_id: Option<u64>,
    title: &str,
    season: u32,
) -> Vec<Vec<(&'static str, String)>> {
    let mut out: Vec<Vec<(&'static str, String)>> = Vec::new();
    if caps.tv_search_tmdb {
        if let Some(id) = tmdb_id {
            out.push(vec![
                ("t", "tvsearch".into()),
                ("tmdbid", id.to_string()),
                ("season", season.to_string()),
            ]);
        }
    }
    if caps.tv_search_season {
        out.push(vec![
            ("t", "tvsearch".into()),
            ("q", title.to_string()),
            ("season", season.to_string()),
        ]);
    }
    out.push(vec![("t", "search".into()), ("q", format!("{title} S{season:02}"))]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn attempts_order_ids_first_then_text_fallback() {
        let caps = Caps { search_tmdb: true, search_imdb: true, ..Caps::default() };
        let q = Query::Movie {
            tmdb_id: Some(603),
            imdb_id: Some("tt0133093".into()),
            title: "The Matrix".into(),
            year: Some(1999),
        };
        let a = attempts(&q, &caps);
        assert_eq!(a.len(), 3);
        assert!(a[0].contains(&("tmdbid", "603".to_string())));
        assert!(a[1].contains(&("imdbid", "0133093".to_string())), "tt prefix stripped");
        assert!(a[2].contains(&("q", "The Matrix 1999".to_string())));

        // Without id caps only the text attempt remains.
        let a = attempts(&q, &Caps::default());
        assert_eq!(a.len(), 1);
    }

    #[test]
    fn episode_and_season_attempts() {
        let caps = Caps { tv_search_tmdb: true, ..Caps::default() };
        let q = Query::Episode { tmdb_id: Some(1396), title: "Breaking Bad".into(), season: 1, episode: 2 };
        let a = attempts(&q, &caps);
        assert_eq!(a.len(), 2);
        assert!(a[0].contains(&("ep", "2".to_string())));
        assert!(a[1].contains(&("q", "Breaking Bad S01E02".to_string())));

        let q = Query::Season { tmdb_id: None, title: "Breaking Bad".into(), season: 3 };
        let a = attempts(&q, &caps);
        assert_eq!(a.len(), 1);
        assert!(a[0].contains(&("q", "Breaking Bad S03".to_string())));
    }

    #[test]
    fn movie_without_ids_only_text_attempt() {
        // Caps advertise id search, but the query carries no ids: text only.
        let caps = Caps { search_tmdb: true, search_imdb: true, ..Caps::default() };
        let q = Query::Movie { tmdb_id: None, imdb_id: None, title: "Heat".into(), year: None };
        let a = attempts(&q, &caps);
        assert_eq!(a.len(), 1);
        assert!(a[0].contains(&("t", "search".to_string())));
        assert!(a[0].contains(&("q", "Heat".to_string())));
    }

    #[test]
    fn movie_text_attempt_includes_year_when_present() {
        let q = Query::Movie { tmdb_id: None, imdb_id: None, title: "Dune".into(), year: Some(2021) };
        let a = attempts(&q, &Caps::default());
        assert_eq!(a.len(), 1);
        assert!(a[0].contains(&("q", "Dune 2021".to_string())));
    }

    #[test]
    fn season_with_tmdb_yields_pack_then_text() {
        let caps = Caps { tv_search_tmdb: true, ..Caps::default() };
        let q = Query::Season { tmdb_id: Some(1396), title: "Breaking Bad".into(), season: 1 };
        let a = attempts(&q, &caps);
        assert_eq!(a.len(), 2);
        assert!(a[0].contains(&("t", "tvsearch".to_string())));
        assert!(a[0].contains(&("season", "1".to_string())));
        assert!(a[1].contains(&("q", "Breaking Bad S01".to_string())));
    }

    #[test]
    fn a_tracker_that_advertises_no_tv_id_search_is_only_ever_asked_in_words() {
        let caps = Caps::default();

        let episode =
            Query::Episode { tmdb_id: Some(1396), title: "Breaking Bad".into(), season: 1, episode: 2 };
        let a = attempts(&episode, &caps);
        assert_eq!(a.len(), 1);
        assert!(a[0].contains(&("q", "Breaking Bad S01E02".to_string())));

        let season = Query::Season { tmdb_id: Some(1396), title: "Breaking Bad".into(), season: 3 };
        let a = attempts(&season, &caps);
        assert_eq!(a.len(), 1);
        assert!(a[0].contains(&("q", "Breaking Bad S03".to_string())));
    }

    #[test]
    fn a_tracker_that_takes_a_season_gets_a_structured_tvsearch() {
        // The common shape by far: `tv-search: [q, season, ep]` and no external
        // ids at all. Skipping tvsearch there left free text as the only tv query
        // an indexer was ever asked, and a tracker whose titles do not literally
        // contain "S03E08" answered nothing.
        let caps = Caps { tv_search_season: true, ..Caps::default() };

        let episode =
            Query::Episode { tmdb_id: None, title: "House of the Dragon".into(), season: 3, episode: 8 };
        let a = attempts(&episode, &caps);
        assert_eq!(a.len(), 2, "structured tvsearch, then free text");
        assert!(a[0].contains(&("t", "tvsearch".to_string())));
        assert!(a[0].contains(&("q", "House of the Dragon".to_string())), "the bare title");
        assert!(a[0].contains(&("season", "3".to_string())));
        assert!(a[0].contains(&("ep", "8".to_string())));
        assert!(a[1].contains(&("q", "House of the Dragon S03E08".to_string())));

        let season = Query::Season { tmdb_id: None, title: "House of the Dragon".into(), season: 3 };
        let a = attempts(&season, &caps);
        assert_eq!(a.len(), 2);
        assert!(a[0].contains(&("season", "3".to_string())));
        // A season pack is not episode 0, so no `ep` is invented for one.
        assert!(!a[0].iter().any(|(k, _)| *k == "ep"));
    }

    #[test]
    fn an_id_capable_tracker_still_tries_the_id_first() {
        let caps = Caps { tv_search_tmdb: true, tv_search_season: true, ..Caps::default() };
        let q = Query::Episode { tmdb_id: Some(1396), title: "Breaking Bad".into(), season: 1, episode: 2 };
        let a = attempts(&q, &caps);
        assert_eq!(a.len(), 3, "tmdbid, then q+season+ep, then free text");
        assert!(a[0].contains(&("tmdbid", "1396".to_string())));
        assert!(a[1].contains(&("q", "Breaking Bad".to_string())));
        assert!(a[2].contains(&("t", "search".to_string())));
    }

    #[test]
    fn movie_tmdb_only_when_imdb_cap_absent() {
        // tmdb cap on, imdb cap off: only the tmdb id attempt precedes the text.
        let caps = Caps { search_tmdb: true, search_imdb: false, ..Caps::default() };
        let q = Query::Movie {
            tmdb_id: Some(603),
            imdb_id: Some("tt0133093".into()),
            title: "The Matrix".into(),
            year: None,
        };
        let a = attempts(&q, &caps);
        assert_eq!(a.len(), 2);
        assert!(a[0].contains(&("tmdbid", "603".to_string())));
        assert!(a[1].contains(&("t", "search".to_string())));
    }

    //
    // The transport shells out to curl, so a socket serving canned XML drives
    // the real request - including the attempt ladder, which is only observable
    // by watching what the indexer was actually asked.

    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};

    // A Torznab endpoint that answers each request from `route`, keyed on the
    // query string it received.
    struct FakeJackett {
        url: String,
        seen: Arc<Mutex<Vec<String>>>,
    }

    impl FakeJackett {
        fn routed(route: impl Fn(&str) -> (u16, String) + Send + 'static) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let port = listener.local_addr().unwrap().port();
            let seen = Arc::new(Mutex::new(Vec::new()));
            let log = Arc::clone(&seen);

            std::thread::spawn(move || {
                for stream in listener.incoming() {
                    let Ok(mut stream) = stream else { break };
                    let mut reader = BufReader::new(stream.try_clone().unwrap());
                    let mut request = String::new();
                    let _ = reader.read_line(&mut request);
                    loop {
                        let mut header = String::new();
                        if reader.read_line(&mut header).unwrap_or(0) == 0 || header == "\r\n" {
                            break;
                        }
                    }
                    // "GET /api?t=caps HTTP/1.1" -> "t=caps"
                    let query = request
                        .split_whitespace()
                        .nth(1)
                        .and_then(|p| p.split_once('?').map(|(_, q)| q.to_string()))
                        .unwrap_or_default();
                    log.lock().unwrap().push(query.clone());
                    let (status, body) = route(&query);
                    let resp = format!(
                        "HTTP/1.1 {status} X\r\nContent-Length: {}\r\nContent-Type: application/xml\r\nConnection: close\r\n\r\n{body}",
                        body.len()
                    );
                    let _ = stream.write_all(resp.as_bytes());
                    let _ = stream.flush();
                }
            });

            Self { url: format!("http://127.0.0.1:{port}/api"), seen }
        }

        fn always(body: &str) -> Self {
            let body = body.to_string();
            Self::routed(move |_| (200, body.clone()))
        }

        fn endpoint(&self) -> IndexerEndpoint {
            IndexerEndpoint {
                url: self.url.clone(),
                api_key: "secret-key".into(),
                categories: vec![2000, 2040],
            }
        }

        fn queries(&self) -> Vec<String> {
            self.seen.lock().unwrap().clone()
        }
    }

    const CAPS_XML: &str = r#"<caps>
      <server title="Jackett" />
      <searching>
        <search available="yes" supportedParams="q" />
        <movie-search available="yes" supportedParams="q,imdbid,tmdbid" />
      </searching>
    </caps>"#;

    const ONE_ITEM: &str = r#"<rss xmlns:torznab="http://torznab.com/schemas/2015/feed"><channel><item>
      <title>The.Matrix.1999.1080p</title><guid>g1</guid><link>magnet:?xt=urn:btih:AB</link>
      <torznab:attr name="seeders" value="9" />
    </item></channel></rss>"#;

    const NO_ITEMS: &str = r#"<rss><channel><title>Indexer</title></channel></rss>"#;

    fn movie_query() -> Query {
        Query::Movie {
            tmdb_id: Some(603),
            imdb_id: Some("tt0133093".into()),
            title: "The Matrix".into(),
            year: Some(1999),
        }
    }

    #[test]
    fn caps_are_fetched_with_the_api_key() {
        let jackett = FakeJackett::always(CAPS_XML);
        let got = caps(&jackett.endpoint()).unwrap();
        assert_eq!(got.server_title.as_deref(), Some("Jackett"));
        assert!(got.search_tmdb && got.search_imdb);

        let asked = &jackett.queries()[0];
        assert!(asked.contains("t=caps"), "{asked}");
        // A private Jackett rejects an unauthenticated call outright.
        assert!(asked.contains("apikey=secret-key"), "{asked}");
    }

    #[test]
    fn a_search_stops_at_the_first_attempt_that_returns_anything() {
        // The strongest parameter set the indexer supports comes first; once it
        // answers there is no reason to spend the weaker calls.
        let jackett = FakeJackett::always(ONE_ITEM);
        let caps = Caps { search_tmdb: true, search_imdb: true, ..Caps::default() };

        let releases = search(&jackett.endpoint(), &movie_query(), &caps).unwrap();
        assert_eq!(releases.len(), 1);
        assert_eq!(releases[0].title, "The.Matrix.1999.1080p");

        let queries = jackett.queries();
        assert_eq!(queries.len(), 1, "extra attempts were spent: {queries:?}");
        assert!(queries[0].contains("tmdbid=603"), "{}", queries[0]);
        // The configured categories ride along, or the tracker returns its whole
        // catalogue.
        // curl percent-encodes the comma, in lowercase hex.
        let cats = queries[0].to_ascii_lowercase();
        assert!(cats.contains("cat=2000%2c2040") || cats.contains("cat=2000,2040"), "{}", queries[0]);
    }

    #[test]
    fn an_id_that_finds_nothing_falls_through_to_the_next_attempt() {
        // Not every tracker behind Jackett resolves external ids, and an id miss
        // must not hide releases a text query would find.
        let jackett = FakeJackett::routed(|q| {
            if q.contains("t=search") {
                (200, ONE_ITEM.to_string())
            } else {
                (200, NO_ITEMS.to_string())
            }
        });
        let caps = Caps { search_tmdb: true, search_imdb: true, ..Caps::default() };

        let releases = search(&jackett.endpoint(), &movie_query(), &caps).unwrap();
        assert_eq!(releases.len(), 1, "the text fallback was never reached");

        let queries = jackett.queries();
        assert_eq!(queries.len(), 3, "{queries:?}");
        assert!(queries[0].contains("tmdbid=603"));
        // Torznab wants the bare number, without the tt prefix.
        assert!(queries[1].contains("imdbid=0133093"), "{}", queries[1]);
        assert!(queries[2].contains("t=search"), "{}", queries[2]);
    }

    #[test]
    fn an_indexer_that_supports_no_ids_is_only_asked_for_text() {
        // Spending an id call on an indexer whose caps say it cannot answer one
        // is a wasted round trip against a tracker that is already slow.
        let jackett = FakeJackett::always(ONE_ITEM);
        let caps = Caps::default();
        search(&jackett.endpoint(), &movie_query(), &caps).unwrap();

        let queries = jackett.queries();
        assert_eq!(queries.len(), 1);
        assert!(queries[0].contains("t=search"), "{}", queries[0]);
        // The year is folded into the free-text query to disambiguate remakes.
        assert!(queries[0].contains("1999"), "{}", queries[0]);
    }

    #[test]
    fn a_genuinely_empty_indexer_is_not_an_error() {
        // "No releases" is a normal answer; erroring would mark a healthy
        // indexer as broken in the admin list.
        let jackett = FakeJackett::always(NO_ITEMS);
        let caps = Caps { search_tmdb: true, ..Caps::default() };
        assert!(search(&jackett.endpoint(), &movie_query(), &caps).unwrap().is_empty());
    }

    #[test]
    fn an_indexer_that_fails_every_attempt_surfaces_the_failure() {
        // Auth and network problems must NOT read as "no releases found" - that
        // is how a misconfigured tracker sits silently broken for weeks.
        let jackett = FakeJackett::routed(|_| {
            (200, r#"<error code="100" description="Incorrect user credentials" />"#.to_string())
        });
        let caps = Caps { search_tmdb: true, search_imdb: true, ..Caps::default() };
        let err = search(&jackett.endpoint(), &movie_query(), &caps).unwrap_err().to_string();
        assert!(err.contains("credentials"), "{err}");
    }

    #[test]
    fn an_endpoint_that_is_not_there_errors_rather_than_hanging() {
        let endpoint = IndexerEndpoint {
            url: "http://127.0.0.1:1/api".into(),
            api_key: String::new(),
            categories: Vec::new(),
        };
        assert!(caps(&endpoint).is_err());
    }

    #[test]
    fn an_endpoint_without_a_key_sends_none() {
        // Public Jackett instances take no key, and sending an empty apikey= is
        // rejected by some of them.
        let jackett = FakeJackett::always(CAPS_XML);
        let endpoint = IndexerEndpoint {
            url: jackett.url.clone(),
            api_key: String::new(),
            categories: Vec::new(),
        };
        caps(&endpoint).unwrap();
        assert!(!jackett.queries()[0].contains("apikey"), "{}", jackett.queries()[0]);
    }

    #[test]
    fn the_registered_port_is_the_same_engine_behind_the_trait() {
        use kroma_module_sdk::ports::TorznabPort;
        let jackett = FakeJackett::routed(|q| {
            if q.contains("t=caps") {
                (200, CAPS_XML.to_string())
            } else {
                (200, ONE_ITEM.to_string())
            }
        });
        let port: &dyn TorznabPort = &TorznabEngine;

        let caps = port.caps(&jackett.endpoint()).unwrap();
        assert_eq!(caps.server_title.as_deref(), Some("Jackett"));
        assert!(caps.search_tmdb && caps.search_imdb);

        let releases = port.search(&jackett.endpoint(), &movie_query(), &caps).unwrap();
        assert_eq!(releases.len(), 1);
        assert_eq!(releases[0].title, "The.Matrix.1999.1080p");
        assert!(jackett.queries()[1].contains("tmdbid=603"), "{}", jackett.queries()[1]);
    }
}

pub mod module;
pub use module::MODULE;

/// The Torznab port implementation: a stateless engine the composition root
/// registers so consumer modules resolve `kroma_module_sdk::ports::TorznabPort`.
pub struct TorznabEngine;

impl kroma_module_sdk::ports::TorznabPort for TorznabEngine {
    fn caps(&self, endpoint: &IndexerEndpoint) -> anyhow::Result<Caps> {
        caps(endpoint)
    }

    fn search(
        &self,
        endpoint: &IndexerEndpoint,
        query: &Query,
        caps: &Caps,
    ) -> anyhow::Result<Vec<Release>> {
        search(endpoint, query, caps)
    }
}
