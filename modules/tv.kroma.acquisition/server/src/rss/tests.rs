use super::*;

fn title(kind: RequestKind, tmdb_id: u64, name: &str, year: Option<u32>, aliases: &[&str]) -> MonitoredTitle {
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
        title(RequestKind::Show, 1, "La Casa de papel", None, &["Money Heist"]),
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
    let rows = [row("a", Some(1), Some(1)), row("b", Some(1), Some(2)), row("c", Some(1), Some(3))];
    let parsed = kroma_scene::parse_release_name("Show.S01E01-E02.1080p.WEB");

    let (target, covered) = target_for(&show, &parsed, &rows).unwrap();

    assert_eq!(target.kind, "episode");
    assert_eq!(covered, ["a", "b"]);
}

#[test]
fn a_pack_aims_at_every_monitored_episode_of_its_season() {
    let show = title(RequestKind::Show, 1, "Show", None, &[]);
    let rows = [row("a", Some(1), Some(1)), row("b", Some(1), Some(2)), row("z", Some(2), Some(1))];
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
