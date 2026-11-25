use super::*;

fn fetched() -> Metadata {
    Metadata {
        tmdb_id: 949,
        title: Some("Heat".into()),
        release_date: Some("1995-12-15".into()),
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
        original_title: Some(" ".into()),
        sort_title: Some(" ".into()),
        tagline: Some("  ".into()),
        overview: Some(String::new()),
        year: None,
        released: Some(" ".into()),
        genres: Some(vec![" ".into()]),
    };

    let tidied = edit.tidied();

    assert!(tidied.is_empty());
}

#[test]
fn tidying_trims_each_field_and_keeps_the_genres_that_say_something() {
    let edit = TitleEdit {
        title: Some("  Heat ".into()),
        original_title: Some(" Heat ".into()),
        sort_title: Some(" Heat ".into()),
        tagline: Some(" A Los Angeles crime saga ".into()),
        overview: Some(" Two men. ".into()),
        year: Some(1995),
        released: Some(" 1995-12-15 ".into()),
        genres: Some(vec![" Crime".into(), "".into(), "Drama ".into()]),
    };

    let tidied = edit.tidied();

    assert_eq!(tidied.title.as_deref(), Some("Heat"));
    assert_eq!(tidied.original_title.as_deref(), Some("Heat"));
    assert_eq!(tidied.sort_title.as_deref(), Some("Heat"));
    assert_eq!(tidied.tagline.as_deref(), Some("A Los Angeles crime saga"));
    assert_eq!(tidied.overview.as_deref(), Some("Two men."));
    assert_eq!(tidied.year, Some(1995));
    assert_eq!(tidied.released.as_deref(), Some("1995-12-15"));
    assert_eq!(tidied.genres, Some(vec!["Crime".into(), "Drama".into()]));
}

#[test]
fn an_edit_fits_up_to_each_limit_and_no_further() {
    let at_limit = TitleEdit {
        title: Some("a".repeat(TITLE_MAX)),
        original_title: Some("a".repeat(TITLE_MAX)),
        sort_title: Some("a".repeat(TITLE_MAX)),
        tagline: Some("é".repeat(TAGLINE_MAX)),
        overview: Some("é".repeat(OVERVIEW_MAX)),
        year: Some(*YEARS.end()),
        released: Some("2200-12-31".into()),
        genres: Some(vec!["g".repeat(GENRE_MAX); GENRES_MAX]),
    };
    let long_title = TitleEdit {
        title: Some("a".repeat(TITLE_MAX + 1)),
        ..Default::default()
    };
    let long_sort_title = TitleEdit {
        sort_title: Some("a".repeat(TITLE_MAX + 1)),
        ..Default::default()
    };
    let long_original_title = TitleEdit {
        original_title: Some("a".repeat(TITLE_MAX + 1)),
        ..Default::default()
    };
    let long_tagline = TitleEdit {
        tagline: Some("a".repeat(TAGLINE_MAX + 1)),
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
    assert!(!long_sort_title.fits());
    assert!(!long_original_title.fits());
    assert!(!long_tagline.fits());
    assert!(!too_many_genres.fits());
    assert!(!long_genre.fits());
    assert!(!early.fits());
}

#[test]
fn clipping_cuts_what_runs_long_and_leaves_out_a_year_no_title_has() {
    let long = TitleEdit {
        title: Some(format!(" {}", "a".repeat(TITLE_MAX + 5))),
        original_title: Some("a".repeat(TITLE_MAX + 1)),
        sort_title: Some("a".repeat(TITLE_MAX + 1)),
        tagline: Some("a".repeat(TAGLINE_MAX + 1)),
        overview: Some("é".repeat(OVERVIEW_MAX + 1)),
        year: Some(*YEARS.end() + 1),
        released: Some("1995-02-30".into()),
        genres: Some(vec!["g".repeat(GENRE_MAX + 1); GENRES_MAX + 1]),
    };

    let clipped = long.clipped();

    assert!(clipped.fits());
    assert_eq!(clipped.title.map(|t| t.chars().count()), Some(TITLE_MAX));
    assert_eq!(
        clipped.original_title.map(|t| t.chars().count()),
        Some(TITLE_MAX)
    );
    assert_eq!(
        clipped.sort_title.map(|t| t.chars().count()),
        Some(TITLE_MAX)
    );
    assert_eq!(
        clipped.tagline.map(|t| t.chars().count()),
        Some(TAGLINE_MAX)
    );
    assert_eq!(
        clipped.overview.map(|t| t.chars().count()),
        Some(OVERVIEW_MAX)
    );
    assert_eq!(clipped.year, None);
    assert_eq!(clipped.released, None);
    assert_eq!(clipped.genres.map(|g| g.len()), Some(GENRES_MAX));
}

#[test]
fn an_edit_over_another_keeps_its_own_fields_and_fills_the_rest() {
    let hand = TitleEdit {
        title: Some("Heat".into()),
        ..Default::default()
    };
    let file = TitleEdit {
        title: Some("heat".into()),
        original_title: Some("Heat".into()),
        sort_title: Some("Heat, the".into()),
        tagline: Some("A Los Angeles crime saga".into()),
        overview: Some("Two men.".into()),
        year: Some(1995),
        released: Some("1995-12-15".into()),
        genres: Some(vec!["Crime".into()]),
    };

    let shown = hand.over(file);

    assert_eq!(shown.title.as_deref(), Some("Heat"));
    assert_eq!(shown.original_title.as_deref(), Some("Heat"));
    assert_eq!(shown.sort_title.as_deref(), Some("Heat, the"));
    assert_eq!(shown.tagline.as_deref(), Some("A Los Angeles crime saga"));
    assert_eq!(shown.overview.as_deref(), Some("Two men."));
    assert_eq!(shown.year, Some(1995));
    assert_eq!(shown.released.as_deref(), Some("1995-12-15"));
    assert_eq!(shown.genres, Some(vec!["Crime".into()]));
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

#[test]
fn a_year_written_drops_a_release_date_that_disagrees_with_it() {
    let moved = TitleEdit {
        year: Some(1996),
        ..Default::default()
    };
    let same = TitleEdit {
        year: Some(1995),
        ..Default::default()
    };

    let (_, year, moved_meta) = written(&moved, Some(fetched()));
    let (_, _, same_meta) = written(&same, Some(fetched()));

    assert_eq!(year, Some(1996));
    assert_eq!(moved_meta.expect("the fetched record").release_date, None);
    assert_eq!(
        same_meta
            .expect("the fetched record")
            .release_date
            .as_deref(),
        Some("1995-12-15")
    );
}

#[test]
fn a_release_date_written_gives_the_year_and_the_date_shown() {
    let edit = TitleEdit {
        year: Some(1990),
        released: Some("1996-03-01".into()),
        ..Default::default()
    }
    .tidied();

    let (_, year, metadata) = written(&edit, Some(fetched()));
    let (_, _, unmatched) = written(&edit, None);

    assert_eq!(edit.year, Some(1996));
    assert_eq!(year, Some(1996));
    assert_eq!(
        metadata
            .expect("the fetched record")
            .release_date
            .as_deref(),
        Some("1996-03-01")
    );
    assert_eq!(
        unmatched.expect("a blank record").release_date.as_deref(),
        Some("1996-03-01")
    );
}

#[test]
fn only_a_day_written_yyyy_mm_dd_fits_as_a_release_date() {
    let dated = |date: &str| TitleEdit {
        released: Some(date.into()),
        ..Default::default()
    };

    assert!(dated("2000-02-29").fits());
    assert!(dated("1995-12-31").fits());
    assert!(!dated("1900-02-29").fits());
    assert!(!dated("1995-02-30").fits());
    assert!(!dated("1995-13-01").fits());
    assert!(!dated("1995-00-10").fits());
    assert!(!dated("1995/12/15").fits());
    assert!(!dated("1995-1-15").fits());
    assert!(!dated("+995-12-15").fits());
    assert!(!dated("1799-12-31").fits());
}

#[test]
fn the_year_and_the_date_below_give_way_together_to_either_written_above() {
    let file = TitleEdit {
        year: Some(1995),
        released: Some("1995-12-15".into()),
        ..Default::default()
    };
    let year_by_hand = TitleEdit {
        year: Some(1996),
        ..Default::default()
    };

    let shown = year_by_hand.over(file);

    assert_eq!(shown.year, Some(1996));
    assert_eq!(shown.released, None);
}

#[test]
fn a_sort_title_goes_on_the_record_and_leaves_the_name_shown() {
    let edit = TitleEdit {
        sort_title: Some("Lord of the Rings, The".into()),
        ..Default::default()
    };

    let (title, _, metadata) = written(&edit, Some(fetched()));
    let (_, _, unmatched) = written(&edit, None);

    let meta = metadata.expect("the fetched record");
    assert_eq!(title, "heat.1995");
    assert_eq!(meta.title.as_deref(), Some("Heat"));
    assert_eq!(meta.sort_title.as_deref(), Some("Lord of the Rings, The"));
    assert_eq!(
        unmatched.expect("a blank record").sort_title.as_deref(),
        Some("Lord of the Rings, The")
    );
}

#[test]
fn an_original_title_goes_on_the_record_beside_the_name_shown() {
    let edit = TitleEdit {
        original_title: Some("Sen to Chihiro no kamikakushi".into()),
        ..Default::default()
    };

    let (title, _, metadata) = written(&edit, Some(fetched()));
    let (_, _, unmatched) = written(&edit, None);

    let meta = metadata.expect("the fetched record");
    assert_eq!(title, "heat.1995");
    assert_eq!(meta.title.as_deref(), Some("Heat"));
    assert_eq!(
        meta.original_title.as_deref(),
        Some("Sen to Chihiro no kamikakushi")
    );
    assert_eq!(
        unmatched.expect("a blank record").original_title.as_deref(),
        Some("Sen to Chihiro no kamikakushi")
    );
}

#[test]
fn a_tagline_goes_on_the_record_above_the_summary_it_leaves() {
    let edit = TitleEdit {
        tagline: Some("A Los Angeles crime saga".into()),
        ..Default::default()
    };

    let (_, _, metadata) = written(&edit, Some(fetched()));
    let (_, _, unmatched) = written(&edit, None);

    let meta = metadata.expect("the fetched record");
    assert_eq!(meta.tagline.as_deref(), Some("A Los Angeles crime saga"));
    assert_eq!(meta.overview.as_deref(), Some("A thief and a detective."));
    assert_eq!(
        unmatched.expect("a blank record").tagline.as_deref(),
        Some("A Los Angeles crime saga")
    );
}
