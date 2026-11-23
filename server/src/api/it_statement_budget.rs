use axum::http::StatusCode;

use crate::api::it_performance::SERIAL;
use crate::api::test_support::{TestApp, demo_item_id, demo_show_id, raw, test_app};
use crate::db;
use crate::model::{Kind, MediaItem};

const MORE: usize = 40;

const ROUTES: &[&str] = &[
    "/api/home",
    "/api/home/featured",
    "/api/movies?view=card",
    "/api/shows?view=card",
    "/api/shows/{show}",
    "/api/shows/{show}/up-next",
    "/api/items/{movie}",
    "/api/items/{movie}/similar",
    "/api/continue",
    "/api/watched",
    "/api/my-list",
    "/api/progress",
    "/api/search?q=the",
    "/api/libraries",
    "/api/admin/libraries",
    "/api/admin/pipeline",
    "/api/admin/pipeline/show/{show}",
    "/api/admin/stats/overview",
];

const GROWS_TODAY: &[&str] = &["/api/admin/pipeline/show/{show}"];

fn copies(of: &MediaItem, count: usize) -> Vec<MediaItem> {
    (0..count)
        .map(|n| {
            let mut copy = of.clone();
            copy.id = format!("{}x{n}", of.id);
            copy.title = format!("{} {n}", of.title);
            copy.episode = of.episode.map(|e| e + 100 + u32::try_from(n).unwrap_or(0));
            for file in &mut copy.files {
                file.id = format!("{}x{n}", file.id);
                file.abs_path = Some(format!("demo://{}", file.id));
            }
            copy.default_file_id = copy.files.first().map(|f| f.id.clone());
            copy
        })
        .collect()
}

fn grown(t: &TestApp, show: &str) {
    let mut data = crate::services::demo::demo_data();
    let episode = data
        .items
        .iter()
        .find(|i| i.show_id.as_deref() == Some(show))
        .cloned()
        .expect("a demo episode");
    let movie = data
        .items
        .iter()
        .find(|i| i.kind == Kind::Movie)
        .cloned()
        .expect("a demo movie");
    let extra: Vec<MediaItem> = copies(&episode, MORE)
        .into_iter()
        .chain(copies(&movie, MORE))
        .collect();
    for item in &extra {
        for file in &item.files {
            data.mtimes.insert(file.id.clone(), Some(1));
        }
    }
    data.items.extend(extra);
    db::sync_all(
        &t.state.db,
        &data.libraries,
        &data.shows,
        &data.items,
        &data.mtimes,
    )
    .expect("grow the demo library");
}

fn grows_per_title(before: u32, after: u32) -> bool {
    let added_titles = u32::try_from(2 * MORE).unwrap_or(u32::MAX);
    after.saturating_sub(before) * 4 >= added_titles
}

fn statements_in(header: &str) -> u32 {
    header
        .split(',')
        .map(str::trim)
        .find(|entry| entry.starts_with("sql;"))
        .and_then(|entry| entry.rsplit("desc=\"").next())
        .and_then(|desc| desc.split(' ').next())
        .and_then(|count| count.parse().ok())
        .unwrap_or(0)
}

async fn statements(t: &TestApp, uri: &str) -> u32 {
    let (status, headers, _) = raw(&t.app, "GET", uri, Some(&t.token), None, &[]).await;
    assert_eq!(status, StatusCode::OK, "{uri}");
    statements_in(
        headers
            .get("server-timing")
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default(),
    )
}

async fn counts(grow: bool) -> Vec<(String, u32)> {
    let t = test_app();
    let show = demo_show_id("The Office");
    let movie = demo_item_id("Blade Runner 2049");
    if grow {
        grown(&t, &show);
    }
    let mut counted = Vec::new();
    for route in ROUTES {
        let uri = route.replace("{show}", &show).replace("{movie}", &movie);
        counted.push(((*route).to_string(), statements(&t, &uri).await));
    }
    counted
}

#[tokio::test]
async fn no_route_runs_a_statement_per_title() {
    let _serial = SERIAL.lock().await;
    kroma_perf::install();
    kroma_perf::profiler().set_enabled(true);

    let small = counts(false).await;
    let large = counts(true).await;

    let grew: Vec<String> = small
        .iter()
        .zip(&large)
        .filter(|((_, before), (_, after))| grows_per_title(*before, *after))
        .map(|((route, before), (_, after))| format!("{route}: {before} -> {after}"))
        .collect();
    let expected: Vec<&str> = GROWS_TODAY.to_vec();
    let named: Vec<&str> = grew
        .iter()
        .map(|line| line.split(':').next().unwrap_or_default())
        .collect();
    assert_eq!(
        named, expected,
        "statements per request grew with the titles: {grew:?}"
    );
    assert!(
        small.iter().any(|(_, n)| *n > 0),
        "the hook counted nothing: {small:?}"
    );
}

#[test]
fn a_few_more_statements_for_eighty_more_titles_is_not_a_loop() {
    assert!(!grows_per_title(44, 47));
    assert!(grows_per_title(21, 141));
}

#[test]
fn the_statement_count_is_read_from_the_timing_header() {
    let header = r#"total;dur=4.2, scope;desc="GET /api/home", sql;dur=1.3;desc="17 sql""#;

    assert_eq!(statements_in(header), 17);
    assert_eq!(statements_in("total;dur=1.0"), 0);
}
