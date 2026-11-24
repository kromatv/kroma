use super::*;
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
    }
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
