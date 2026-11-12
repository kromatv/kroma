use kroma_module_sdk::host::testing::StubHost;

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
    let def =
        def_with_modes("    movie-search: [q, imdbid, tmdbid]\n    tv-search: [q, season, tmdbid]");
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
fn the_module_declares_its_id_migrations_and_admin_routes() {
    let pool = kroma_module_sdk::db::testing::temp_pool("indexer-lib");
    kroma_module_sdk::db::apply_migrations(&pool.get().unwrap(), db::MIGRATIONS).unwrap();
    let host = StubHost::with_store(pool.clone());
    let module = server_module::<StubHost>();
    assert_eq!(module.id(), MODULE_ID);
    assert_eq!(module.id(), "tv.kroma.indexer");
    assert_eq!(module.migrations(), db::MIGRATIONS);
    assert!(!db::MIGRATIONS.trim().is_empty());
    assert!(
        module.admin_routes(&host).is_some(),
        "the admin UI has nowhere to talk to"
    );
}

#[test]
fn the_module_keeps_its_catalog_current_with_one_scheduled_job() {
    let module = server_module::<StubHost>();

    let jobs = module.jobs();

    assert_eq!(jobs.len(), 1);
    assert_eq!(jobs[0].key, admin::SYNC_JOB);
    assert!(jobs[0].schedule.is_some());
}

#[test]
fn the_catalog_job_takes_the_vpn_route_and_records_why_it_could_not() {
    let host = StubHost::new().with_setting("acqIndexersUseVpn", serde_json::json!(true));
    let job = server_module::<StubHost>().jobs().remove(0);

    let err = (job.run)(&host).unwrap_err().to_string();

    assert!(err.contains("no VPN is running"), "{err}");
    assert!(admin::definition_store(&host).record().failure.is_some());
}

#[test]
fn the_module_hands_the_host_every_schema_step() {
    let module = server_module::<StubHost>();

    let steps: Vec<&str> = module.steps().iter().map(|step| step.name).collect();

    let declared: Vec<&str> = db::STEPS.iter().map(|step| step.name).collect();
    assert_eq!(steps, declared);
    assert!(steps.contains(&"indexer_pace"));
}
