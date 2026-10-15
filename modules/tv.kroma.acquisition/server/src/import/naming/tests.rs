use super::*;

use kroma_module_sdk::host::testing::StubHost;

const MATRIX: &str = "The.Matrix.1999.2160p.UHD.BluRay.DV.x265-GROUP";

fn meta(kind: RequestKind) -> ImportMeta {
    ImportMeta {
        kind,
        title: "The Matrix".into(),
        year: Some(1999),
        tmdb_id: Some(603),
    }
}

fn row(release_title: &str) -> DownloadRow {
    DownloadRow {
        id: "d1".into(),
        kind: "movie".into(),
        release_title: release_title.into(),
        ..Default::default()
    }
}

fn host_with_request(kind: &str, title: &str, year: &str) -> StubHost {
    let core = kroma_module_sdk::db::testing::temp_pool("acq-naming");
    core.get()
        .unwrap()
        .execute_batch(&format!(
            "INSERT INTO requests (id,kind,tmdb_id,title,year,status,created_at,updated_at) \
             VALUES ('rq1','{kind}',603,'{title}',{year},'approved',1,1)"
        ))
        .unwrap();
    StubHost::with_core(core)
}

#[test]
fn a_film_is_filed_under_the_catalogue_title_and_the_releases_own_quality() {
    let src = Path::new("/downloads/x").join(format!("{MATRIX}.mkv"));

    let ctx = movie_ctx(&meta(RequestKind::Movie), &src);

    assert_eq!(ctx.title, "The Matrix");
    assert_eq!(ctx.year, Some(1999));
    assert_eq!(ctx.resolution.as_deref(), Some("2160p"));
    assert_eq!(ctx.codec.as_deref(), Some("x265"));
    assert_eq!(ctx.release_group.as_deref(), Some("GROUP"));
    assert_eq!(ctx.dynamic_range.as_deref(), Some("DV"));
    assert_eq!(ctx.tmdb_id, Some(603));
}

#[test]
fn a_film_whose_name_says_nothing_about_its_quality_renders_without_one() {
    let ctx = movie_ctx(&meta(RequestKind::Movie), Path::new("/downloads/m/movie.mkv"));

    assert_eq!(ctx.resolution, None);
    assert_eq!(ctx.codec, None);
    assert_eq!(ctx.source, None);
    assert_eq!(ctx.dynamic_range, None);
    assert!(!ctx.proper);
    assert!(!ctx.repack);
}

#[test]
fn an_episode_carries_the_season_and_episode_the_match_settled_on() {
    let parsed = kroma_scene::parse_release_name("A.Show.S02E05.1080p.WEB-DL.x264-GRP");

    let ctx = episode_ctx(&meta(RequestKind::Show), 2, 5, &parsed);

    assert_eq!(ctx.title, "The Matrix");
    assert_eq!(ctx.year, Some(1999));
    assert_eq!(ctx.season, Some(2));
    assert_eq!(ctx.episode, Some(5));
    assert_eq!(ctx.resolution.as_deref(), Some("1080p"));
    assert_eq!(ctx.release_group.as_deref(), Some("GRP"));
}

#[test]
fn a_proper_is_marked_so_the_rendered_name_says_which_cut_it_is() {
    let parsed = kroma_scene::parse_release_name("A.Show.S01E01.PROPER.1080p.HDR.x265-GRP");

    let ctx = episode_ctx(&meta(RequestKind::Show), 1, 1, &parsed);

    assert!(ctx.proper);
    assert_eq!(ctx.dynamic_range.as_deref(), Some("HDR"));
}

#[test]
fn the_request_a_download_was_grabbed_for_names_what_it_is_filed_under() {
    let host = host_with_request("show", "Dark", "2017");
    let mut row = row(MATRIX);
    row.request_id = Some("rq1".into());
    row.title = Some("a stale ledger title".into());
    row.tmdb_id = 603;

    let meta = resolve_meta(&host, &row).unwrap();

    assert_eq!(meta.kind, RequestKind::Show);
    assert_eq!(meta.title, "Dark");
    assert_eq!(meta.year, Some(2017));
    assert_eq!(meta.tmdb_id, Some(603));
}

#[test]
fn a_download_whose_request_is_gone_falls_back_to_the_ledgers_own_metadata() {
    let host = host_with_request("movie", "The Matrix", "1999");
    let mut row = row(MATRIX);
    row.request_id = Some("rq-vanished".into());
    row.title = Some("A Show".into());
    row.year = Some(2017);
    row.kind = "show".into();

    let meta = resolve_meta(&host, &row).unwrap();

    assert_eq!(meta.kind, RequestKind::Show);
    assert_eq!(meta.title, "A Show");
    assert_eq!(meta.year, Some(2017));
    assert_eq!(meta.tmdb_id, None);
}

#[test]
fn a_blank_ledger_title_is_no_title_at_all() {
    let host = StubHost::new();
    let mut row = row(MATRIX);
    row.title = Some("   ".into());

    let meta = resolve_meta(&host, &row).unwrap();

    assert_eq!(meta.title, "The Matrix");
    assert_eq!(meta.year, Some(1999));
}

#[test]
fn a_bare_magnet_is_filed_under_the_title_read_off_its_release_name() {
    let host = StubHost::new();
    let mut row = row(MATRIX);
    row.tmdb_id = 603;

    let meta = resolve_meta(&host, &row).unwrap();

    assert_eq!(meta.kind, RequestKind::Movie);
    assert_eq!(meta.title, "The Matrix");
    assert_eq!(meta.year, Some(1999));
    assert_eq!(meta.tmdb_id, Some(603));
}

#[test]
fn a_release_name_nothing_can_be_read_out_of_refuses_the_import() {
    let host = StubHost::new();

    let Err(refused) = resolve_meta(&host, &row("")) else {
        panic!("a release with no name must not be imported under one");
    };

    assert!(refused.to_string().contains("could not determine a title"));
}

#[test]
fn a_path_with_no_file_name_has_no_release_name_to_parse() {
    assert_eq!(
        stem_of(Path::new("/downloads/The.Matrix.1999.mkv")),
        "The.Matrix.1999"
    );
    assert_eq!(stem_of(Path::new("/")), "");
}
