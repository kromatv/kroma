use super::*;
use crate::imports::{Elsewhere, Lead};
use crate::metadata_core::{ITEM, SHOW};
use crate::testing::temp_pool;

fn text(id: &str, library: &str, title: &str) -> Text {
    Text {
        nfo: Nfo {
            subject_kind: ITEM,
            subject_id: id.into(),
            library: library.into(),
            path: format!("/media/{id}.nfo"),
            modified: Some(1_700_000_000_000),
        },
        edit: TitleEdit {
            title: Some(title.into()),
            ..Default::default()
        },
        tmdb: None,
        elsewhere: Elsewhere::default(),
    }
}

fn on_imdb(id: &str, imdb: &str) -> Text {
    let mut text = text(id, "lib", "Heat");
    text.elsewhere.imdb = Some(imdb.into());
    text
}

fn kept(libraries: &[&str]) -> HashSet<String> {
    libraries.iter().map(|l| (*l).to_string()).collect()
}

#[test]
fn a_scan_replaces_what_an_earlier_one_read() {
    let pool = temp_pool("text-beside");
    replace(
        &pool,
        &[text("m1", "lib", "Tape"), text("m2", "lib", "Reel")],
        &kept(&[]),
    )
    .unwrap();

    let written = replace(&pool, &[text("m1", "lib", "Tape three")], &kept(&[])).unwrap();

    let read = read_before(&pool).unwrap();
    assert_eq!(written, 1);
    assert_eq!(read.len(), 1);
    assert_eq!(
        read.get("/media/m1.nfo"),
        Some(&Read {
            modified: Some(1_700_000_000_000),
            edit: text("m1", "lib", "Tape three").edit,
            tmdb: None,
            elsewhere: Elsewhere::default(),
        })
    );
}

#[test]
fn a_library_the_scan_could_not_read_keeps_what_it_held() {
    let pool = temp_pool("text-beside");
    replace(
        &pool,
        &[text("m1", "nas", "Tape"), text("m2", "lib", "Reel")],
        &kept(&[]),
    )
    .unwrap();

    replace(&pool, &[], &kept(&["nas"])).unwrap();

    let read = read_before(&pool).unwrap();
    assert!(read.contains_key("/media/m1.nfo"));
    assert!(!read.contains_key("/media/m2.nfo"));
}

#[test]
fn a_text_belongs_to_one_kind_of_title() {
    let pool = temp_pool("text-beside");
    let mut show = text("x1", "lib", "Our show");
    show.nfo.subject_kind = SHOW;
    show.nfo.path = "/media/x1/tvshow.nfo".into();

    replace(&pool, &[text("x1", "lib", "Our film"), show], &kept(&[])).unwrap();

    assert_eq!(read_before(&pool).unwrap().len(), 2);
}

#[test]
fn the_tmdb_id_a_file_names_leads_its_own_title() {
    let pool = temp_pool("text-beside");
    let mut heat = text("m1", "lib", "Heat");
    heat.tmdb = Some(949);
    let mut show = text("m1", "lib", "Our show");
    show.nfo.subject_kind = SHOW;
    show.nfo.path = "/media/m1/tvshow.nfo".into();
    show.tmdb = Some(1438);
    replace(&pool, &[heat, show, text("m2", "lib", "Reel")], &kept(&[])).unwrap();

    let leads = leads(&pool, ITEM).unwrap();

    let conn = pool.get().unwrap();
    assert_eq!(leads, HashMap::from([("m1".to_string(), Lead::Tmdb(949))]));
    assert_eq!(lead(&conn, SHOW, "m1").unwrap(), Some(Lead::Tmdb(1438)));
    assert_eq!(lead(&conn, ITEM, "m2").unwrap(), None);
    assert_eq!(read_before(&pool).unwrap()["/media/m1.nfo"].tmdb, Some(949));
}

#[test]
fn a_file_that_names_only_an_imdb_or_a_tvdb_id_leads_to_asking_tmdb() {
    let pool = temp_pool("text-beside");
    let mut wire = text("x1", "lib", "The Wire");
    wire.nfo.subject_kind = SHOW;
    wire.elsewhere.tvdb = Some(79126);
    replace(&pool, &[on_imdb("m1", "tt0113277"), wire], &kept(&[])).unwrap();

    let leads = leads(&pool, ITEM).unwrap();

    let conn = pool.get().unwrap();
    let heat = Elsewhere {
        imdb: Some("tt0113277".into()),
        tvdb: None,
    };
    let the_wire = Elsewhere {
        imdb: None,
        tvdb: Some(79126),
    };
    assert_eq!(leads, HashMap::from([("m1".to_string(), Lead::Ask(heat))]));
    assert_eq!(lead(&conn, SHOW, "x1").unwrap(), Some(Lead::Ask(the_wire)));
}

#[test]
fn what_tmdb_answered_for_a_file_leads_its_title_and_is_read_back_with_the_file() {
    let pool = temp_pool("text-beside");
    replace(&pool, &[on_imdb("m1", "tt0113277")], &kept(&[])).unwrap();
    let asked = on_imdb("m1", "tt0113277").elsewhere;

    answer(&pool, ITEM, &asked, Some(949)).unwrap();

    let conn = pool.get().unwrap();
    let read = read_before(&pool).unwrap();
    assert_eq!(lead(&conn, ITEM, "m1").unwrap(), Some(Lead::Tmdb(949)));
    assert_eq!(read["/media/m1.nfo"].tmdb, Some(949));
    assert_eq!(read["/media/m1.nfo"].elsewhere, asked);
}

#[test]
fn a_file_tmdb_knows_nothing_about_leads_nowhere() {
    let pool = temp_pool("text-beside");
    replace(&pool, &[on_imdb("m1", "tt0000002")], &kept(&[])).unwrap();

    answer(&pool, ITEM, &on_imdb("m1", "tt0000002").elsewhere, None).unwrap();

    let conn = pool.get().unwrap();
    assert_eq!(lead(&conn, ITEM, "m1").unwrap(), None);
    assert!(leads(&pool, ITEM).unwrap().is_empty());
}
