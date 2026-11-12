use super::*;
use crate::notifications::test_support::*;
use crate::notifications::{insert_notification, list_notifications, unread_count};

#[test]
fn opening_the_panel_sees_every_row_and_clears_the_badge() {
    let (p, u1, u2) = pool();
    insert(&p, "n1", &u1, 1_000);
    insert(&p, "n2", &u1, 2_000);
    insert(&p, "other", &u2, 2_000);
    let conn = p.get().unwrap();

    let moved = mark_seen(&conn, &u1, 3_000).unwrap();

    assert_eq!(moved, 2);
    assert_eq!(unseen_count(&conn, &u1).unwrap(), 0);
    assert_eq!(unread_count(&conn, &u1).unwrap(), 2);
    assert_eq!(unseen_count(&conn, &u2).unwrap(), 1);
}

#[test]
fn a_repeat_after_the_panel_was_opened_lights_the_badge_again() {
    let (p, u1, _) = pool();
    let conn = p.get().unwrap();
    let mut failing = new("n1", 1_000);
    failing.group_key = Some("system.job.failed:job:library.scan".into());
    insert_notification(&conn, &u1, &failing).unwrap();
    mark_seen(&conn, &u1, 1_500).unwrap();
    failing.id = "n2".into();
    failing.created_at = 2_000;

    insert_notification(&conn, &u1, &failing).unwrap();

    assert_eq!(unseen_count(&conn, &u1).unwrap(), 1);
}

#[test]
fn an_archived_row_leaves_the_inbox_the_badge_and_the_unread_tally() {
    let (p, u1, _) = pool();
    insert(&p, "n1", &u1, 1_000);
    insert(&p, "n2", &u1, 2_000);

    let moved = set_archived(&p, &u1, &["n1".into()], Some(3_000)).unwrap();

    let conn = p.get().unwrap();
    assert_eq!(moved, 1);
    let inbox: Vec<String> = list_notifications(&conn, &u1, 50, false)
        .unwrap()
        .into_iter()
        .map(|n| n.id)
        .collect();
    assert_eq!(inbox, vec!["n2"]);
    assert_eq!(list_archived(&conn, &u1, 50).unwrap()[0].id, "n1");
    assert_eq!(unseen_count(&conn, &u1).unwrap(), 1);
    assert_eq!(unread_count(&conn, &u1).unwrap(), 1);
}

#[test]
fn a_row_brought_back_from_the_archive_is_in_the_inbox_again() {
    let (p, u1, _) = pool();
    insert(&p, "n1", &u1, 1_000);
    set_archived(&p, &u1, &["n1".into()], Some(2_000)).unwrap();

    let moved = set_archived(&p, &u1, &["n1".into()], None).unwrap();

    let conn = p.get().unwrap();
    assert_eq!(moved, 1);
    assert_eq!(list_notifications(&conn, &u1, 50, false).unwrap().len(), 1);
    assert!(list_archived(&conn, &u1, 50).unwrap().is_empty());
}

#[test]
fn archiving_another_readers_row_moves_nothing() {
    let (p, u1, u2) = pool();
    insert(&p, "n1", &u1, 1_000);

    let moved = set_archived(&p, &u2, &["n1".into()], Some(2_000)).unwrap();

    assert_eq!(moved, 0);
    assert_eq!(
        list_notifications(&p.get().unwrap(), &u1, 50, false)
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn a_repeat_of_an_archived_group_starts_a_new_row() {
    let (p, u1, _) = pool();
    let conn = p.get().unwrap();
    let mut failing = new("n1", 1_000);
    failing.group_key = Some("system.job.failed:job:library.scan".into());
    insert_notification(&conn, &u1, &failing).unwrap();
    set_archived(&p, &u1, &["n1".into()], Some(1_500)).unwrap();
    failing.id = "n2".into();
    failing.created_at = 2_000;

    let written = insert_notification(&conn, &u1, &failing).unwrap();

    assert!(!written.folded);
    assert_eq!(written.id, "n2");
}

#[test]
fn only_the_first_press_of_an_action_is_recorded() {
    let (p, u1, u2) = pool();
    insert(&p, "n1", &u1, 1_000);
    let conn = p.get().unwrap();

    let first = mark_interacted(&conn, &u1, "n1", 2_000).unwrap();
    let again = mark_interacted(&conn, &u1, "n1", 3_000).unwrap();
    let stranger = mark_interacted(&conn, &u2, "n1", 3_000).unwrap();

    assert!(first);
    assert!(!again);
    assert!(!stranger);
}

#[test]
fn archiving_the_read_rows_leaves_every_unread_one_in_the_inbox() {
    let (p, u1, u2) = pool();
    insert(&p, "read", &u1, 1_000);
    insert(&p, "unread", &u1, 2_000);
    insert(&p, "theirs", &u2, 1_000);
    crate::notifications::mark_read(&p, &u1, Some(&["read".to_string()]), 3_000).unwrap();
    crate::notifications::mark_read(&p, &u2, None, 3_000).unwrap();
    let conn = p.get().unwrap();

    let moved = archive_read(&conn, &u1, 4_000).unwrap();

    assert_eq!(moved, 1);
    assert_eq!(list_archived(&conn, &u1, 50).unwrap()[0].id, "read");
    assert_eq!(
        list_notifications(&conn, &u1, 50, false).unwrap()[0].id,
        "unread"
    );
    assert!(list_archived(&conn, &u2, 50).unwrap().is_empty());
}
