use super::*;
use crate::notifications::test_support::*;

const JOB_FAILED: TypeDefault<'static> = TypeDefault {
    name: "system.job.failed",
    pushes: true,
};

const QUIET: TypeDefault<'static> = TypeDefault {
    name: "tv.kroma.torrents/download.completed",
    pushes: false,
};

fn system(in_app: bool, push: bool) -> CategoryPref {
    CategoryPref {
        category: NotificationCategory::System,
        in_app,
        push,
    }
}

#[test]
fn prefs_default_to_on_for_every_category() {
    let (p, u1, _) = pool();
    let conn = p.get().unwrap();
    let prefs = prefs(&conn, &u1).unwrap();
    assert_eq!(prefs.len(), NotificationCategory::ALL.len());
    assert!(prefs.iter().all(|p| p.in_app && p.push));
    assert_eq!(
        allows(&conn, &u1, NotificationCategory::Media, None).unwrap(),
        (true, true)
    );
}

#[test]
fn setting_prefs_persists_and_is_read_back_per_category() {
    let (p, u1, u2) = pool();
    set_prefs(
        &p,
        &u1,
        &[CategoryPref {
            category: NotificationCategory::Media,
            in_app: true,
            push: false,
        }],
        &[],
    )
    .unwrap();
    let conn = p.get().unwrap();
    assert_eq!(
        allows(&conn, &u1, NotificationCategory::Media, None).unwrap(),
        (true, false)
    );
    assert_eq!(
        allows(&conn, &u1, NotificationCategory::Requests, None).unwrap(),
        (true, true)
    );
    assert_eq!(
        allows(&conn, &u2, NotificationCategory::Media, None).unwrap(),
        (true, true)
    );
}

#[test]
fn setting_prefs_twice_updates_in_place() {
    let (p, u1, _) = pool();
    set_prefs(&p, &u1, &[system(false, false)], &[]).unwrap();
    set_prefs(&p, &u1, &[system(true, false)], &[]).unwrap();
    let conn = p.get().unwrap();
    assert_eq!(
        allows(&conn, &u1, NotificationCategory::System, None).unwrap(),
        (true, false)
    );
}

#[test]
fn a_type_nobody_chose_for_follows_its_category() {
    let (p, u1, _) = pool();
    set_prefs(&p, &u1, &[system(true, false)], &[]).unwrap();
    let conn = p.get().unwrap();

    let switches = allows(&conn, &u1, NotificationCategory::System, Some(JOB_FAILED)).unwrap();

    assert_eq!(switches, (true, false));
}

#[test]
fn a_type_switched_off_stays_off_while_its_category_is_on() {
    let (p, u1, _) = pool();
    let muted = TypeChoice {
        in_app: Some(false),
        push: None,
    };
    set_prefs(&p, &u1, &[], &[(JOB_FAILED.name.to_string(), muted)]).unwrap();
    let conn = p.get().unwrap();

    let job = allows(&conn, &u1, NotificationCategory::System, Some(JOB_FAILED)).unwrap();
    let disk = TypeDefault {
        name: "system.disk.low",
        pushes: true,
    };
    let other = allows(&conn, &u1, NotificationCategory::System, Some(disk)).unwrap();

    assert_eq!(job, (false, true));
    assert_eq!(other, (true, true));
}

#[test]
fn a_type_that_does_not_push_unasked_is_quiet_until_its_reader_turns_it_on() {
    let (p, u1, _) = pool();
    let conn = p.get().unwrap();
    assert_eq!(
        allows(&conn, &u1, NotificationCategory::Downloads, Some(QUIET)).unwrap(),
        (true, false)
    );
    drop(conn);
    let asked = TypeChoice {
        in_app: None,
        push: Some(true),
    };

    set_prefs(&p, &u1, &[], &[(QUIET.name.to_string(), asked)]).unwrap();

    let conn = p.get().unwrap();
    assert_eq!(
        allows(&conn, &u1, NotificationCategory::Downloads, Some(QUIET)).unwrap(),
        (true, true)
    );
}

#[test]
fn a_type_set_back_to_its_category_loses_its_row() {
    let (p, u1, _) = pool();
    let muted = TypeChoice {
        in_app: Some(false),
        push: None,
    };
    set_prefs(&p, &u1, &[], &[(JOB_FAILED.name.to_string(), muted)]).unwrap();

    set_prefs(
        &p,
        &u1,
        &[],
        &[(JOB_FAILED.name.to_string(), TypeChoice::default())],
    )
    .unwrap();

    let conn = p.get().unwrap();
    assert!(type_choices(&conn, &u1).unwrap().is_empty());
}

#[test]
fn the_choices_a_user_made_are_read_back_by_type() {
    let (p, u1, u2) = pool();
    let push_off = TypeChoice {
        in_app: None,
        push: Some(false),
    };
    set_prefs(&p, &u1, &[], &[(JOB_FAILED.name.to_string(), push_off)]).unwrap();
    let conn = p.get().unwrap();

    let choices = type_choices(&conn, &u1).unwrap();

    assert_eq!(choices.get(JOB_FAILED.name), Some(&push_off));
    assert!(type_choices(&conn, &u2).unwrap().is_empty());
}

#[test]
fn a_choice_keeps_only_the_switches_that_depart_from_the_category() {
    let category = system(true, true);

    let push_off = TypeChoice::departing(true, false, &category, true);
    let same = TypeChoice::departing(true, true, &category, true);
    let asked = TypeChoice::departing(true, true, &category, false);

    assert_eq!(
        push_off,
        TypeChoice {
            in_app: None,
            push: Some(false)
        }
    );
    assert_eq!(same, TypeChoice::default());
    assert_eq!(asked.push, Some(true));
}
