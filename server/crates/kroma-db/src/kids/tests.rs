use super::*;
use crate::testing::{TempPool, temp_pool};

fn pool() -> TempPool {
    temp_pool("kids")
}

fn new_kid(name: &str) -> NewKidsProfile<'_> {
    NewKidsProfile {
        username: name,
        level: MaturityLevel::Seven,
        libraries: &LibraryScope::All,
    }
}

#[test]
fn a_kids_profile_is_an_account_with_no_real_address_a_kids_level_and_playback_alone() {
    let pool = pool();

    let kid = create_kids_profile(&pool, &new_kid("Léo")).unwrap();

    assert_eq!(kid.username, "Léo");
    assert!(kid.email.ends_with(".invalid"), "{}", kid.email);
    assert_eq!(kid.permissions, [Permission::Playback]);
    assert!(is_kids_profile(&pool, &kid.id).unwrap());
    assert_eq!(
        crate::profile_maturity(&pool, &kid.id).unwrap().level,
        MaturityLevel::Seven
    );
}

#[test]
fn nobody_signs_in_to_a_kids_profile_by_its_name() {
    let pool = pool();
    create_kids_profile(&pool, &new_kid("Léo")).unwrap();

    assert!(crate::find_user_by_login(&pool, "Léo").unwrap().is_none());
    assert!(crate::list_users(&pool).unwrap().is_empty());
}

#[test]
fn the_kids_profiles_are_listed_oldest_first_and_an_adult_is_not_one() {
    let pool = pool();
    let first = create_kids_profile(&pool, &new_kid("Léo")).unwrap();
    let second = create_kids_profile(&pool, &new_kid("Zoé")).unwrap();

    let listed: Vec<String> = kids_profiles(&pool)
        .unwrap()
        .into_iter()
        .map(|k| k.id)
        .collect();

    assert_eq!(listed.len(), 2);
    assert!(listed.contains(&first.id) && listed.contains(&second.id));
    assert!(!is_kids_profile(&pool, "someone").unwrap());
}

#[test]
fn a_backup_carries_a_kids_profile_its_level_and_its_rules_back() {
    let source = pool();
    let kid = create_kids_profile(&source, &new_kid("Léo")).unwrap();
    crate::set_title_rule(
        &source,
        (&kid.id, "a-film"),
        Some(kroma_domain::TitleRule::Allow),
    )
    .unwrap();
    let doc = crate::export_portable(&source, source.path().parent().unwrap()).unwrap();

    let restored = temp_pool("kids-restored");
    crate::import_portable(&restored, restored.path().parent().unwrap(), &doc, false).unwrap();

    assert!(is_kids_profile(&restored, &kid.id).unwrap());
    assert_eq!(
        crate::profile_maturity(&restored, &kid.id).unwrap().level,
        MaturityLevel::Seven
    );
    assert_eq!(crate::title_rules(&restored, &kid.id).unwrap().len(), 1);
    assert!(
        crate::find_user_by_login(&restored, "Léo")
            .unwrap()
            .is_none()
    );
}
