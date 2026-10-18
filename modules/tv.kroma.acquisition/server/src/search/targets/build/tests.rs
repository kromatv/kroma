use super::*;

fn ep(season: u32, episode: u32, air_date: Option<&str>) -> WantedRow {
    row(season, episode, air_date, "wanted")
}

fn row(season: u32, episode: u32, air_date: Option<&str>, status: &str) -> WantedRow {
    WantedRow {
        id: format!("s{season}e{episode}"),
        request_id: Some("r1".into()),
        kind: "episode".into(),
        tmdb_id: 42,
        imdb_id: None,
        title: "Show".into(),
        year: Some(2026),
        season: Some(season),
        episode: Some(episode),
        air_date: air_date.map(str::to_string),
        status: status.into(),
        last_search_at: None,
    }
}

fn movie_row(year: Option<u32>, air_date: Option<&str>) -> WantedRow {
    WantedRow {
        id: "m1".into(),
        request_id: Some("r1".into()),
        kind: "movie".into(),
        tmdb_id: 7,
        imdb_id: Some("tt1".into()),
        title: "Film".into(),
        year,
        season: None,
        episode: None,
        air_date: air_date.map(str::to_string),
        status: "wanted".into(),
        last_search_at: None,
    }
}

fn episode_numbers(targets: &[SearchTarget]) -> Vec<u32> {
    targets
        .iter()
        .filter(|t| t.kind == "episode")
        .filter_map(|t| t.episodes.as_ref()?.first())
        .copied()
        .collect()
}

#[test]
fn airing_season_searches_aired_episodes_per_episode_only() {
    let rows = vec![
        ep(1, 1, Some("2026-07-01")),
        ep(1, 2, Some("2026-07-08")),
        ep(1, 3, Some("2026-07-22")),
    ];
    let t = targets_for_wanted(RequestKind::Show, &rows, "2026-07-16");
    assert_eq!(t.len(), 2, "two aired episodes, no pack, no future ep");
    assert!(t.iter().all(|x| x.kind == "episode"));
    assert_eq!(episode_numbers(&t), vec![1, 2]);
}

#[test]
fn complete_season_searches_pack_first_then_episode_fallback() {
    let rows = vec![ep(2, 1, Some("2025-01-01")), ep(2, 2, Some("2025-01-08"))];
    let t = targets_for_wanted(RequestKind::Show, &rows, "2026-07-16");
    assert_eq!(t.len(), 3);
    assert_eq!(t[0].kind, "season");
    assert!(t[1..].iter().all(|x| x.kind == "episode"));
}

#[test]
fn no_air_date_is_treated_as_aired_complete() {
    let rows = vec![ep(1, 1, None), ep(1, 2, None)];
    let t = targets_for_wanted(RequestKind::Show, &rows, "2026-07-16");
    assert_eq!(t[0].kind, "season");
    assert_eq!(t.len(), 3);
}

#[test]
fn pack_budget_counts_the_whole_season_not_the_open_rows() {
    // Eight already on disk, two still wanted: a real ten-episode pack must
    // be budgeted for ten, or the scorer rejects every one as too-big.
    let mut rows: Vec<WantedRow> = (1..=8)
        .map(|e| row(3, e, Some("2025-01-01"), "available"))
        .collect();
    rows.push(ep(3, 9, Some("2025-01-01")));
    rows.push(ep(3, 10, Some("2025-01-08")));

    let t = targets_for_wanted(RequestKind::Show, &rows, "2026-07-16");
    let pack = t
        .iter()
        .find(|x| x.kind == "season")
        .expect("a pack target");
    assert!(matches!(
        pack.target,
        Target::Season {
            season: 3,
            episodes: 10
        }
    ));
}

#[test]
fn movie_target_built_for_aired_movie() {
    let rows = vec![movie_row(Some(2020), None)];
    let t = targets_for_wanted(RequestKind::Movie, &rows, "2026-07-16");
    assert_eq!(t.len(), 1);
    assert_eq!(t[0].kind, "movie");
    assert!(matches!(t[0].target, Target::Movie { year: Some(2020) }));
}

#[test]
fn future_movie_is_not_searched() {
    let rows = vec![movie_row(Some(2030), Some("2030-01-01"))];
    let t = targets_for_wanted(RequestKind::Movie, &rows, "2026-07-16");
    assert!(t.is_empty());
}

#[test]
fn wanted_ids_by_movie_season_episode() {
    let rows = vec![movie_row(None, None), ep(1, 1, None), ep(1, 2, None)];
    assert_eq!(
        wanted_ids_by(&rows, "movie", None, None),
        vec!["m1".to_string()]
    );
    assert_eq!(
        wanted_ids_by(&rows, "season", Some(1), None),
        vec!["s1e1".to_string(), "s1e2".to_string()]
    );
    assert_eq!(
        wanted_ids_by(&rows, "episode", Some(1), Some(&[2])),
        vec!["s1e2".to_string()]
    );
    assert!(wanted_ids_by(&rows, "episode", Some(1), Some(&[9])).is_empty());
}
