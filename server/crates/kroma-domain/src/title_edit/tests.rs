use super::*;

fn fetched() -> Metadata {
    Metadata {
        tmdb_id: 949,
        title: Some("Heat".into()),
        overview: Some("A thief and a detective.".into()),
        genres: vec!["Crime".into()],
        tmdb_genre_ids: vec![80],
        ..Metadata::blank()
    }
}

struct Scanned(String, Option<u32>, Option<Metadata>);

impl Editable for Scanned {
    fn written(&mut self) -> Written<'_> {
        Written {
            title: &mut self.0,
            year: &mut self.1,
            metadata: &mut self.2,
        }
    }
}

fn written(
    edit: &TitleEdit,
    metadata: Option<Metadata>,
) -> (String, Option<u32>, Option<Metadata>) {
    let mut scanned = Scanned("heat.1995".into(), Some(1995), metadata);
    edit.onto(&mut scanned);
    (scanned.0, scanned.1, scanned.2)
}

#[test]
fn an_edit_left_blank_follows_the_provider_in_every_field() {
    let edit = TitleEdit {
        title: Some("   ".into()),
        overview: Some(String::new()),
        year: None,
        genres: Some(vec![" ".into()]),
    };

    let tidied = edit.tidied();

    assert!(tidied.is_empty());
}

#[test]
fn tidying_trims_each_field_and_keeps_the_genres_that_say_something() {
    let edit = TitleEdit {
        title: Some("  Heat ".into()),
        overview: Some(" Two men. ".into()),
        year: Some(1995),
        genres: Some(vec![" Crime".into(), "".into(), "Drama ".into()]),
    };

    let tidied = edit.tidied();

    assert_eq!(tidied.title.as_deref(), Some("Heat"));
    assert_eq!(tidied.overview.as_deref(), Some("Two men."));
    assert_eq!(tidied.year, Some(1995));
    assert_eq!(tidied.genres, Some(vec!["Crime".into(), "Drama".into()]));
}

#[test]
fn an_edit_fits_up_to_each_limit_and_no_further() {
    let at_limit = TitleEdit {
        title: Some("a".repeat(TITLE_MAX)),
        overview: Some("é".repeat(OVERVIEW_MAX)),
        year: Some(*YEARS.end()),
        genres: Some(vec!["g".repeat(GENRE_MAX); GENRES_MAX]),
    };
    let long_title = TitleEdit {
        title: Some("a".repeat(TITLE_MAX + 1)),
        ..Default::default()
    };
    let too_many_genres = TitleEdit {
        genres: Some(vec!["g".into(); GENRES_MAX + 1]),
        ..Default::default()
    };
    let long_genre = TitleEdit {
        genres: Some(vec!["g".repeat(GENRE_MAX + 1)]),
        ..Default::default()
    };
    let early = TitleEdit {
        year: Some(*YEARS.start() - 1),
        ..Default::default()
    };

    assert!(at_limit.fits());
    assert!(!long_title.fits());
    assert!(!too_many_genres.fits());
    assert!(!long_genre.fits());
    assert!(!early.fits());
}

#[test]
fn each_written_field_replaces_the_provider_one_and_the_rest_stay() {
    let edit = TitleEdit {
        title: Some("Heat (director's cut)".into()),
        genres: Some(vec!["Thriller".into()]),
        ..Default::default()
    };

    let (title, year, metadata) = written(&edit, Some(fetched()));

    let meta = metadata.expect("the fetched record");
    assert_eq!(title, "Heat (director's cut)");
    assert_eq!(year, Some(1995));
    assert_eq!(meta.title.as_deref(), Some("Heat (director's cut)"));
    assert_eq!(meta.overview.as_deref(), Some("A thief and a detective."));
    assert_eq!(meta.genres, vec!["Thriller".to_string()]);
    assert!(meta.tmdb_genre_ids.is_empty());
    assert_eq!(meta.tmdb_id, 949);
}

#[test]
fn a_summary_written_for_a_title_never_matched_gives_it_a_record() {
    let edit = TitleEdit {
        overview: Some("Found in the attic.".into()),
        year: Some(1987),
        ..Default::default()
    };

    let (title, year, metadata) = written(&edit, None);

    let meta = metadata.expect("a blank record");
    assert_eq!(title, "heat.1995");
    assert_eq!(year, Some(1987));
    assert_eq!(meta.overview.as_deref(), Some("Found in the attic."));
    assert_eq!(meta.tmdb_id, 0);
}

#[test]
fn a_new_name_alone_does_not_invent_a_record() {
    let edit = TitleEdit {
        title: Some("Home movies".into()),
        ..Default::default()
    };

    let (title, _, metadata) = written(&edit, None);

    assert_eq!(title, "Home movies");
    assert!(metadata.is_none());
}

#[test]
fn an_edit_reads_back_what_it_wrote_and_fields_it_never_had() {
    let edit = TitleEdit {
        year: Some(2001),
        ..Default::default()
    };

    let json = serde_json::to_string(&edit).expect("write the edit");
    let back: TitleEdit = serde_json::from_str(&json).expect("read the edit");
    let sparse: TitleEdit =
        serde_json::from_str(r#"{"title":"Heat"}"#).expect("read a sparse edit");

    assert_eq!(back, edit);
    assert_eq!(sparse.title.as_deref(), Some("Heat"));
    assert_eq!(sparse.genres, None);
}
