use super::*;
use crate::Metadata;
use crate::title_edit::TitleEdit;

fn actor(name: &str, role: Option<&str>) -> Actor {
    Actor {
        name: name.into(),
        role: role.map(Into::into),
    }
}

fn member(name: &str, tmdb_id: u64, character: &str) -> CastMember {
    CastMember {
        name: name.into(),
        tmdb_id: Some(tmdb_id),
        character: Some(character.into()),
        profile_url: Some(format!("/p/{tmdb_id}.jpg")),
    }
}

fn written(cast: Vec<Actor>) -> TitleEdit {
    TitleEdit {
        cast: Some(cast),
        ..TitleEdit::default()
    }
}

#[test]
fn tidying_trims_each_actor_and_drops_the_ones_with_no_name() {
    let cast = vec![
        actor(" Al Pacino ", Some(" Vincent Hanna ")),
        actor(" ", Some("Nobody")),
        actor("Robert De Niro", Some(" ")),
    ];

    let tidied = written(cast).tidied();
    let blank = written(vec![actor("", None)]).tidied();

    assert_eq!(
        tidied.cast,
        Some(vec![
            actor("Al Pacino", Some("Vincent Hanna")),
            actor("Robert De Niro", None),
        ])
    );
    assert_eq!(blank.cast, None);
}

#[test]
fn a_cast_fits_up_to_its_limits_and_is_cut_to_them_when_read() {
    let longest = actor(&"n".repeat(PERSON_MAX), Some(&"r".repeat(ROLE_MAX)));
    let too_long = actor(&"n".repeat(PERSON_MAX + 1), Some(&"r".repeat(ROLE_MAX + 1)));

    let full = written(vec![longest.clone(); CAST_MAX]);
    let crowded = written(vec![longest; CAST_MAX + 1]);
    let wordy = written(vec![too_long]);
    let clipped = crowded.clone().clipped().cast.expect("a cast");
    let cut = wordy.clone().clipped().cast.expect("a cast");

    assert!(full.fits());
    assert!(!crowded.fits());
    assert!(!wordy.fits());
    assert_eq!(clipped.len(), CAST_MAX);
    assert_eq!(cut[0].name.chars().count(), PERSON_MAX);
    assert_eq!(
        cut[0].role.as_deref().map(|r| r.chars().count()),
        Some(ROLE_MAX)
    );
}

#[test]
fn a_cast_written_replaces_the_provider_s_and_keeps_the_people_it_named() {
    let mut meta = Metadata {
        cast: vec![
            member("Al Pacino", 1158, "Lt. Vincent Hanna"),
            member("Robert De Niro", 380, "Neil McCauley"),
        ],
        ..Metadata::blank()
    };
    let edit = written(vec![
        actor("robert de niro", None),
        actor("Al Pacino", Some("Vincent Hanna")),
        actor("Jane Doe", Some("A bank teller")),
    ]);

    edit.onto_metadata(&mut meta);

    let shown: Vec<(&str, Option<u64>, Option<&str>)> = meta
        .cast
        .iter()
        .map(|m| (m.name.as_str(), m.tmdb_id, m.character.as_deref()))
        .collect();
    assert_eq!(
        shown,
        vec![
            ("Robert De Niro", Some(380), Some("Neil McCauley")),
            ("Al Pacino", Some(1158), Some("Vincent Hanna")),
            ("Jane Doe", None, Some("A bank teller")),
        ]
    );
    assert_eq!(meta.cast[0].profile_url.as_deref(), Some("/p/380.jpg"));
    assert_eq!(meta.cast[2].profile_url, None);
}

#[test]
fn a_cast_written_above_wins_and_one_below_fills_an_edit_without_one() {
    let file = written(vec![actor("Al Pacino", None)]);
    let hand = written(vec![actor("Jane Doe", None)]);

    let over_file = hand.over(file.clone());
    let nothing_over_file = TitleEdit::default().over(file);

    assert_eq!(over_file.cast, Some(vec![actor("Jane Doe", None)]));
    assert_eq!(nothing_over_file.cast, Some(vec![actor("Al Pacino", None)]));
}
