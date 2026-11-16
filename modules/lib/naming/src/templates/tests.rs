use std::collections::HashMap;

use super::*;

fn movie_ctx() -> NameContext {
    NameContext {
        title: "The Matrix".into(),
        year: Some(1999),
        resolution: Some("1080p".into()),
        source: Some("Bluray".into()),
        ..Default::default()
    }
}

fn episode_ctx() -> NameContext {
    NameContext {
        title: "Breaking Bad".into(),
        year: Some(2008),
        season: Some(1),
        episode: Some(2),
        episode_title: Some("Cat's in the Bag...".into()),
        resolution: Some("720p".into()),
        source: Some("HDTV".into()),
        ..Default::default()
    }
}

#[test]
fn radarr_default_movie_format() {
    let tpl = NamingTemplates {
        movie_folder: DEFAULT_MOVIE_FOLDER.into(),
        movie_file: DEFAULT_MOVIE_FILE.into(),
        series_folder: String::new(),
        season_folder: String::new(),
        episode_file: String::new(),
        case: Casing::Default,
    };
    let p = tpl.movie_rel_path(&movie_ctx(), "mkv");
    assert_eq!(
        p.to_str().unwrap(),
        "The Matrix (1999)/The Matrix (1999) Bluray-1080p.mkv"
    );
}

#[test]
fn sonarr_default_episode_format() {
    let tpl = NamingTemplates {
        movie_folder: String::new(),
        movie_file: String::new(),
        series_folder: DEFAULT_SERIES_FOLDER.into(),
        season_folder: DEFAULT_SEASON_FOLDER.into(),
        episode_file: DEFAULT_EPISODE_FILE.into(),
        case: Casing::Default,
    };
    let p = tpl.episode_rel_path(&episode_ctx(), "mkv");
    assert_eq!(
        p.to_str().unwrap(),
        "Breaking Bad (2008)/Season 01/Breaking Bad - S01E02 - Cat's in the Bag... HDTV-720p.mkv"
    );
}

#[test]
fn the_path_in_a_series_is_the_episode_path_without_its_series_folder() {
    let tpl = NamingTemplates {
        movie_folder: String::new(),
        movie_file: String::new(),
        series_folder: DEFAULT_SERIES_FOLDER.into(),
        season_folder: DEFAULT_SEASON_FOLDER.into(),
        episode_file: DEFAULT_EPISODE_FILE.into(),
        case: Casing::Lower,
    };

    let inside = tpl.episode_path_in_series(&episode_ctx(), "mkv");

    let full = tpl.episode_rel_path(&episode_ctx(), "mkv");
    assert_eq!(full.strip_prefix("breaking bad (2008)").unwrap(), inside);
}

#[test]
fn the_path_in_a_series_is_just_the_file_without_a_season_template() {
    let tpl = NamingTemplates {
        movie_folder: String::new(),
        movie_file: String::new(),
        series_folder: "{Series Title}".into(),
        season_folder: String::new(),
        episode_file: "{Episode Title}".into(),
        case: Casing::Default,
    };
    let ctx = NameContext {
        title: "Show".into(),
        episode_title: Some("Pilot".into()),
        ..Default::default()
    };

    let p = tpl.episode_path_in_series(&ctx, "mkv");

    assert_eq!(p.to_str().unwrap(), "Pilot.mkv");
}

#[test]
fn forbidden_chars_removed_from_filename() {
    let tpl = NamingTemplates {
        movie_folder: String::new(),
        movie_file: "{Movie Title} ({Release Year})".into(),
        series_folder: String::new(),
        season_folder: String::new(),
        episode_file: String::new(),
        case: Casing::Default,
    };
    let ctx = NameContext {
        title: "Mission: Impossible".into(),
        year: Some(1996),
        ..Default::default()
    };
    let p = tpl.movie_rel_path(&ctx, "mkv");
    assert_eq!(p.to_str().unwrap(), "Mission Impossible (1996).mkv");
    assert!(!p.to_str().unwrap().contains(':'));
}

#[test]
fn case_transform_applies() {
    let mk = |case: Casing| NamingTemplates {
        movie_folder: String::new(),
        movie_file: "{Movie Title} ({Release Year})".into(),
        series_folder: String::new(),
        season_folder: String::new(),
        episode_file: String::new(),
        case,
    };
    let ctx = NameContext {
        title: "The Matrix".into(),
        year: Some(1999),
        ..Default::default()
    };
    assert_eq!(
        mk(Casing::Upper)
            .movie_rel_path(&ctx, "mkv")
            .to_str()
            .unwrap(),
        "THE MATRIX (1999).mkv"
    );
    assert_eq!(
        mk(Casing::Lower)
            .movie_rel_path(&ctx, "mkv")
            .to_str()
            .unwrap(),
        "the matrix (1999).mkv"
    );
    assert_eq!(
        mk(Casing::Default)
            .movie_rel_path(&ctx, "mkv")
            .to_str()
            .unwrap(),
        "The Matrix (1999).mkv"
    );
}
#[test]
fn file_component_falls_back_when_name_empty() {
    let tpl = NamingTemplates {
        movie_folder: String::new(),
        movie_file: "{Resolution}".into(),
        series_folder: String::new(),
        season_folder: String::new(),
        episode_file: String::new(),
        case: Casing::Default,
    };
    let p = tpl.movie_rel_path(&NameContext::default(), "mkv");
    assert_eq!(p.to_str().unwrap(), "file.mkv");
}

#[test]
fn episode_path_skips_empty_season_folder() {
    let tpl = NamingTemplates {
        movie_folder: String::new(),
        movie_file: String::new(),
        series_folder: "{Series Title}".into(),
        season_folder: String::new(),
        episode_file: "{Episode Title}".into(),
        case: Casing::Default,
    };
    let ctx = NameContext {
        title: "Show".into(),
        episode_title: Some("Pilot".into()),
        ..Default::default()
    };
    let p = tpl.episode_rel_path(&ctx, "mkv");
    assert_eq!(p.to_str().unwrap(), "Show/Pilot.mkv");
}

// The spellings the core's settings store registers for these keys
// (`kroma_engine::services::settings::store`). They are ALIASES of the
// constants above: a server that never touched the settings has to name a
// file the same way either default would, and the test below pins that.
fn registered() -> HashMap<String, String> {
    HashMap::from([
        (
            "namingMovieFolder".to_string(),
            "{Title} ({Year})".to_string(),
        ),
        (
            "namingMovieFile".to_string(),
            "{Title} ({Year}) {Quality Full}".to_string(),
        ),
        (
            "namingSeriesFolder".to_string(),
            "{Title} ({Year})".to_string(),
        ),
        (
            "namingSeasonFolder".to_string(),
            "Season {season:00}".to_string(),
        ),
        (
            "namingEpisodeFile".to_string(),
            "{Title} - S{season:00}E{episode:00} - {Episode Title} {Quality Full}".to_string(),
        ),
    ])
}

// A settings seam, in the shape every caller's really is: a stored value when
// there is one, the caller's default otherwise.
fn reader(stored: HashMap<String, String>) -> impl Fn(&str, &str) -> String {
    move |key: &str, default: &str| {
        stored
            .get(key)
            .cloned()
            .unwrap_or_else(|| default.to_string())
    }
}

#[test]
fn an_unconfigured_server_names_files_the_same_way_either_default_would() {
    let from_store = NamingTemplates::read(reader(registered()));
    let from_constants = NamingTemplates {
        movie_folder: DEFAULT_MOVIE_FOLDER.into(),
        movie_file: DEFAULT_MOVIE_FILE.into(),
        series_folder: DEFAULT_SERIES_FOLDER.into(),
        season_folder: DEFAULT_SEASON_FOLDER.into(),
        episode_file: DEFAULT_EPISODE_FILE.into(),
        case: Casing::default(),
    };

    assert_ne!(
        from_store.movie_folder, from_constants.movie_folder,
        "two spellings"
    );
    assert_eq!(
        from_store.movie_rel_path(&movie_ctx(), "mkv"),
        from_constants.movie_rel_path(&movie_ctx(), "mkv"),
        "the two defaults must name the same file",
    );
    assert_eq!(
        from_store.episode_rel_path(&episode_ctx(), "mkv"),
        from_constants.episode_rel_path(&episode_ctx(), "mkv"),
    );
}

#[test]
fn a_template_an_admin_cleared_falls_back_rather_than_naming_everything_alike() {
    let mut blanked = registered();
    for value in blanked.values_mut() {
        *value = "   ".to_string();
    }

    let cleared = NamingTemplates::read(reader(blanked));
    let fresh = NamingTemplates::read(reader(registered()));

    assert!(!cleared.movie_folder.trim().is_empty());
    assert!(!cleared.episode_file.trim().is_empty());
    assert_eq!(
        cleared.movie_rel_path(&movie_ctx(), "mkv"),
        fresh.movie_rel_path(&movie_ctx(), "mkv"),
    );
    assert_eq!(
        cleared.episode_rel_path(&episode_ctx(), "mkv"),
        fresh.episode_rel_path(&episode_ctx(), "mkv"),
    );
}

#[test]
fn a_configured_template_is_used_as_written() {
    let mut stored = registered();
    stored.insert("namingMovieFolder".into(), "{Movie Title}".into());
    stored.insert("namingCase".into(), "lower".into());

    let t = NamingTemplates::read(reader(stored));

    assert_eq!(t.movie_folder, "{Movie Title}");
    let path = t.movie_rel_path(&movie_ctx(), "mkv");
    assert!(path.starts_with("the matrix"), "{path:?}");
}
