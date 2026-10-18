use std::sync::{Arc, Mutex};

use kroma_module_sdk::host::testing::StubHost;
use kroma_module_sdk::testing::blocking;
use serde_json::json;

use super::*;
use crate::rules::blocklist::{self, Blocked};
use crate::search::best::test_world::{host, monitor, monitored, want, wanted_row, Fakes};

fn title(
    kind: RequestKind,
    tmdb_id: u64,
    name: &str,
    year: Option<u32>,
    aliases: &[&str],
) -> MonitoredTitle {
    MonitoredTitle {
        kind,
        tmdb_id,
        title: name.into(),
        year,
        poster_url: None,
        seasons: vec![1],
        monitor_new_seasons: true,
        min_availability: Default::default(),
        last_season: Some(1),
        added_by: None,
        added_at: 0,
        updated_at: 0,
        original_language: None,
        air_status: None,
        refreshed_at: None,
        known_episodes: Default::default(),
        aliases: aliases.iter().map(|a| (*a).to_string()).collect(),
    }
}

fn row(id: &str, season: Option<u32>, episode: Option<u32>) -> WantedRow {
    WantedRow {
        id: id.into(),
        request_id: None,
        kind: if season.is_some() { "episode" } else { "movie" }.into(),
        tmdb_id: 1,
        imdb_id: None,
        title: "T".into(),
        year: None,
        season,
        episode,
        air_date: None,
        status: "wanted".into(),
        last_search_at: None,
    }
}

fn library() -> Vec<MonitoredTitle> {
    vec![
        title(
            RequestKind::Show,
            1,
            "La Casa de papel",
            None,
            &["Money Heist"],
        ),
        title(RequestKind::Movie, 2, "Dune", Some(2021), &[]),
        title(RequestKind::Movie, 3, "Dune", Some(1984), &[]),
    ]
}

#[test]
fn a_name_is_cleaned_down_to_what_every_spelling_shares() {
    assert_eq!(clean_title("Amélie & Co."), "amelieandco");
    assert_eq!(clean_title("Money.Heist"), "moneyheist");
}

#[test]
fn a_release_under_the_alias_finds_its_show() {
    let titles = library();
    let by_name = index_titles(&titles);

    let found = match_title(&by_name, "Money.Heist.S05E01.1080p.WEB-DL.x264-GRP");

    assert_eq!(found.map(|t| t.tmdb_id), Some(1));
}

#[test]
fn a_film_is_told_from_its_remake_by_the_year() {
    let titles = library();
    let by_name = index_titles(&titles);

    let new = match_title(&by_name, "Dune.2021.2160p.WEB-DL.x265-GRP");
    let old = match_title(&by_name, "Dune.1984.1080p.BluRay.x264-GRP");

    assert_eq!(new.map(|t| t.tmdb_id), Some(2));
    assert_eq!(old.map(|t| t.tmdb_id), Some(3));
}

#[test]
fn an_episode_never_matches_a_film_and_a_film_never_a_show() {
    let titles = library();
    let by_name = index_titles(&titles);

    assert!(match_title(&by_name, "Dune.S01E01.1080p.WEB").is_none());
    assert!(match_title(&by_name, "Money.Heist.2017.1080p.WEB").is_none());
    assert!(match_title(&by_name, "Unknown.Show.S01E01.1080p").is_none());
}

#[test]
fn an_episode_release_aims_at_the_rows_it_holds() {
    let show = title(RequestKind::Show, 1, "Show", None, &[]);
    let rows = [
        row("a", Some(1), Some(1)),
        row("b", Some(1), Some(2)),
        row("c", Some(1), Some(3)),
    ];
    let parsed = kroma_scene::parse_release_name("Show.S01E01-E02.1080p.WEB");

    let (target, covered) = target_for(&show, &parsed, &rows).unwrap();

    assert_eq!(target.kind, "episode");
    assert_eq!(covered, ["a", "b"]);
}

#[test]
fn a_pack_aims_at_every_monitored_episode_of_its_season() {
    let show = title(RequestKind::Show, 1, "Show", None, &[]);
    let rows = [
        row("a", Some(1), Some(1)),
        row("b", Some(1), Some(2)),
        row("z", Some(2), Some(1)),
    ];
    let parsed = kroma_scene::parse_release_name("Show.S01.1080p.WEB");

    let (target, covered) = target_for(&show, &parsed, &rows).unwrap();

    assert_eq!(target.kind, "season");
    assert_eq!(covered, ["a", "b"]);
}

#[test]
fn an_episode_nobody_monitors_is_not_a_target() {
    let show = title(RequestKind::Show, 1, "Show", None, &[]);
    let parsed = kroma_scene::parse_release_name("Show.S03E01.1080p.WEB");

    assert!(target_for(&show, &parsed, &[row("a", Some(1), Some(1))]).is_none());
}

#[test]
fn a_film_release_aims_at_its_one_row() {
    let film = title(RequestKind::Movie, 2, "Dune", Some(2021), &[]);
    let parsed = kroma_scene::parse_release_name("Dune.2021.1080p.WEB");

    let (target, covered) = target_for(&film, &parsed, &[row("m", None, None)]).unwrap();

    assert_eq!(target.kind, "movie");
    assert_eq!(covered, ["m"]);
}

const DUNE_1080: &str = "Dune.2021.1080p.BluRay.x264-GRP";
const DUNE_720: &str = "Dune.2021.720p.WEB-DL.x264-GRP";

async fn rss(host: StubHost) -> (RssSummary, Vec<String>) {
    blocking(move || {
        let logs = Arc::new(Mutex::new(Vec::new()));
        let sink = logs.clone();
        let log = move |line: String| sink.lock().unwrap().push(line);
        let summary = rss_pass(&host, &log).unwrap();
        let lines = logs.lock().unwrap().clone();
        (summary, lines)
    })
    .await
}

fn dune() -> MonitoredTitle {
    monitored(RequestKind::Movie, 2, "Dune", Some(2021))
}

async fn wanting_dune(fakes: &Fakes) -> StubHost {
    let host = host(fakes).await;
    let film = dune();
    monitor(&host, &film);
    want(&host, &[wanted_row("m1", &film, None, None, "wanted")]);
    host
}

#[tokio::test(flavor = "multi_thread")]
async fn a_release_of_a_missing_film_is_grabbed_for_its_row() {
    let fakes = Fakes::new().offering(&[DUNE_1080]);
    let host = wanting_dune(&fakes).await;

    let (summary, _) = rss(host).await;

    assert_eq!(
        summary,
        RssSummary {
            releases: 1,
            matched: 1,
            grabbed: 1
        }
    );
    assert_eq!(fakes.grabbed_titles(), [DUNE_1080]);
    assert_eq!(fakes.grabbed_rows(), [["m1"]]);
}

#[tokio::test(flavor = "multi_thread")]
async fn of_two_releases_for_one_row_only_the_better_is_grabbed() {
    let fakes = Fakes::new().offering(&[DUNE_720, DUNE_1080]);
    let host = wanting_dune(&fakes).await;

    let (summary, _) = rss(host).await;

    assert_eq!(summary.matched, 2);
    assert_eq!(fakes.grabbed_titles(), [DUNE_1080]);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_better_release_listed_first_is_not_displaced_by_a_worse_one() {
    let fakes = Fakes::new().offering(&[DUNE_1080, DUNE_720]);
    let host = wanting_dune(&fakes).await;

    rss(host).await;

    assert_eq!(fakes.grabbed_titles(), [DUNE_1080]);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_release_of_nothing_monitored_is_counted_and_left() {
    let fakes = Fakes::new().offering(&["Arrival.2016.1080p.BluRay.x264-GRP"]);
    let host = wanting_dune(&fakes).await;

    let (summary, _) = rss(host).await;

    assert_eq!(
        summary,
        RssSummary {
            releases: 1,
            matched: 0,
            grabbed: 0
        }
    );
    assert!(fakes.grabbed_titles().is_empty());
}

#[tokio::test(flavor = "multi_thread")]
async fn a_film_already_grabbed_is_not_grabbed_again() {
    let fakes = Fakes::new().offering(&[DUNE_1080]);
    let host = host(&fakes).await;
    let film = dune();
    monitor(&host, &film);
    want(&host, &[wanted_row("m1", &film, None, None, "grabbed")]);

    let (summary, _) = rss(host).await;

    assert_eq!(summary.matched, 1);
    assert_eq!(summary.grabbed, 0);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_film_the_library_already_holds_at_the_cutoff_is_left_alone() {
    let fakes = Fakes::new().offering(&[DUNE_720]);
    let host = host(&fakes).await;
    let film = dune();
    monitor(&host, &film);
    want(&host, &[wanted_row("m1", &film, None, None, "available")]);
    crate::search::best::test_world::hold_file(
        &host,
        &film,
        None,
        None,
        "Dune.2021.1080p.BluRay.x264-GRP.mkv",
    );

    let (summary, _) = rss(host).await;

    assert_eq!(summary.grabbed, 0);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_blocked_release_is_not_grabbed() {
    let fakes = Fakes::new().offering(&[DUNE_1080]);
    let host = wanting_dune(&fakes).await;
    blocklist::add(
        host.store(),
        &Blocked {
            id: "b1".into(),
            kind: RequestKind::Movie,
            tmdb_id: 2,
            release_title: DUNE_1080.into(),
            info_hash: None,
            indexer_id: None,
            reason: "stalled".into(),
            added_at: 0,
        },
    )
    .unwrap();

    let (summary, _) = rss(host).await;

    assert_eq!(summary.matched, 1);
    assert!(fakes.grabbed_titles().is_empty());
}

#[tokio::test(flavor = "multi_thread")]
async fn a_release_with_no_link_is_not_grabbed() {
    let mut fakes = Fakes::new().offering(&[DUNE_1080]);
    fakes.releases[0]["magnet"] = json!(null);
    let host = wanting_dune(&fakes).await;

    let (summary, _) = rss(host).await;

    assert_eq!(summary.grabbed, 0);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_release_the_rules_refuse_is_not_grabbed() {
    let mut fakes = Fakes::new().offering(&[DUNE_1080]);
    fakes.releases[0]["seeders"] = json!(0);
    let host = wanting_dune(&fakes).await;

    let (summary, _) = rss(host).await;

    assert_eq!(summary.grabbed, 0);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_failed_grab_is_logged_and_not_counted() {
    let mut fakes = Fakes::new().offering(&[DUNE_1080]);
    fakes.grab_error = Some("engine down".into());
    let host = wanting_dune(&fakes).await;

    let (summary, logs) = rss(host).await;

    assert_eq!(summary.grabbed, 0);
    assert!(logs.iter().any(|l| l.starts_with("rss: grab failed")), "{logs:?}");
}

#[tokio::test(flavor = "multi_thread")]
async fn an_indexer_that_does_not_answer_is_logged_and_skipped() {
    let mut fakes = Fakes::new().offering(&[DUNE_1080]);
    fakes.search_error = Some("timed out".into());
    let host = wanting_dune(&fakes).await;

    let (summary, logs) = rss(host).await;

    assert_eq!(summary, RssSummary::default());
    assert!(logs.iter().any(|l| l.contains("Tracker did not answer")), "{logs:?}");
}

#[tokio::test(flavor = "multi_thread")]
async fn a_pass_inside_the_interval_reads_nothing() {
    let fakes = Fakes::new().offering(&[DUNE_1080]);
    let host = wanting_dune(&fakes).await;
    rss(host.clone()).await;

    let (second, _) = rss(host).await;

    assert_eq!(second, RssSummary::default());
    assert_eq!(fakes.grabbed_titles().len(), 1);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_zero_interval_turns_the_pass_off() {
    let fakes = Fakes::new().offering(&[DUNE_1080]);
    let host = wanting_dune(&fakes).await.with_setting("acqRssMinutes", json!(0));

    let (summary, _) = rss(host).await;

    assert_eq!(summary, RssSummary::default());
}

#[tokio::test(flavor = "multi_thread")]
async fn a_server_with_acquisition_off_reads_nothing() {
    let fakes = Fakes::new().offering(&[DUNE_1080]);
    let host = wanting_dune(&fakes)
        .await
        .with_setting("acqEnabled", json!(false));

    let (summary, _) = rss(host).await;

    assert_eq!(summary, RssSummary::default());
}

#[tokio::test(flavor = "multi_thread")]
async fn a_closed_kill_switch_reads_nothing() {
    let mut fakes = Fakes::new().offering(&[DUNE_1080]);
    fakes.gate = false;
    let host = wanting_dune(&fakes).await;

    let (summary, _) = rss(host).await;

    assert_eq!(summary, RssSummary::default());
}

#[tokio::test(flavor = "multi_thread")]
async fn a_season_pack_is_grabbed_for_every_row_of_its_season() {
    let fakes = Fakes::new().offering(&["Show.S01.1080p.BluRay.x264-GRP"]);
    let host = host(&fakes).await;
    let show = monitored(RequestKind::Show, 1, "Show", None);
    monitor(&host, &show);
    want(
        &host,
        &[
            wanted_row("a", &show, Some(1), Some(1), "wanted"),
            wanted_row("b", &show, Some(1), Some(2), "wanted"),
        ],
    );

    let (summary, _) = rss(host).await;

    assert_eq!(summary.grabbed, 1);
    assert_eq!(fakes.grabbed_rows(), [["a", "b"]]);
}

#[test]
fn every_accented_letter_folds_to_its_plain_one() {
    assert_eq!(clean_title("àâä çéèêë îï ñ ôö ùûü ýÿ"), "aaaceeeeiinoouuuyy");
}

#[test]
fn a_film_release_without_a_year_matches_whatever_year_the_title_has() {
    let titles = library();
    let by_name = index_titles(&titles);

    let found = match_title(&by_name, "Dune.1080p.BluRay.x264-GRP");

    assert_eq!(found.map(|t| t.tmdb_id), Some(2));
}

#[test]
fn a_pack_of_a_season_nobody_monitors_is_not_a_target() {
    let show = title(RequestKind::Show, 1, "Show", None, &[]);
    let parsed = kroma_scene::parse_release_name("Show.S04.1080p.WEB");

    assert!(target_for(&show, &parsed, &[row("a", Some(1), Some(1))]).is_none());
}

#[tokio::test(flavor = "multi_thread")]
async fn a_release_of_a_title_with_no_row_to_fill_is_not_grabbed() {
    let fakes = Fakes::new().offering(&[DUNE_1080]);
    let host = host(&fakes).await;
    monitor(&host, &dune());

    let (summary, _) = rss(host).await;

    assert_eq!(summary.matched, 1);
    assert_eq!(summary.grabbed, 0);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_release_better_than_the_copy_held_is_grabbed_as_an_upgrade() {
    let fakes = Fakes::new().offering(&[DUNE_1080]);
    let host = host(&fakes).await;
    let film = dune();
    monitor(&host, &film);
    want(&host, &[wanted_row("m1", &film, None, None, "available")]);
    crate::search::best::test_world::hold_file(
        &host,
        &film,
        None,
        None,
        "Dune.2021.720p.WEB-DL.x264-GRP.mkv",
    );

    let (summary, _) = rss(host).await;

    assert_eq!(summary.grabbed, 1);
    assert_eq!(fakes.grabbed_rows(), [["m1"]]);
}
