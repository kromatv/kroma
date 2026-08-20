use super::*;
use crate::services::cast::registry::test_support::{announce_ok, beat};

#[test]
fn a_kicked_remote_stops_being_obeyed_until_it_picks_the_set_up_again() {
    let reg = Registry::new();
    announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
    reg.attach_controller("tv-salon-01", "sock-b", "iPad", "u1", "alice", None).expect("attached");

    assert_eq!(reg.may_command("tv-salon-01", "u1"), Some(true));
    reg.kick_controller("tv-salon-01", "sock-b").expect("kicked");

    assert_eq!(reg.may_command("tv-salon-01", "u1"), Some(false));

    reg.attach_controller("tv-salon-01", "sock-c", "iPad", "u1", "alice", None).expect("attached");
    assert_eq!(reg.may_command("tv-salon-01", "u1"), Some(true));

    // Not a 403: the caller answers 404, so this cannot probe which ids exist.
    assert_eq!(reg.may_command("tv-ghost-01", "u1"), None);
}

#[test]
fn a_television_lists_its_remotes_and_can_let_one_go() {
    let reg = Registry::new();
    announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);

    let row = reg
        .attach_controller("tv-salon-01", "sock-a", "iPhone", "u1", "alice", None)
        .expect("attached");
    assert_eq!(row.controllers.len(), 1);
    let row = reg
        .attach_controller("tv-salon-01", "sock-b", "Chrome", "u1", "alice", None)
        .expect("attached");
    assert_eq!(
        row.controllers.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(),
        vec!["Chrome", "iPhone"],
        "listed in a stable order, so the TV's list does not reshuffle"
    );

    assert!(reg.attach_controller("tv-salon-01", "sock-a", "iPhone", "u1", "alice", None).is_none());

    let (row, owner) = reg.kick_controller("tv-salon-01", "sock-b").expect("kicked");
    assert_eq!(owner, "u1");
    assert_eq!(row.controllers.len(), 1);
    assert_eq!(row.controllers[0].name, "iPhone");
    assert!(reg.kick_controller("tv-salon-01", "sock-b").is_none());

    let rows = reg.detach_controller("sock-a");
    assert_eq!(rows.len(), 1);
    let (owner, row) = &rows[0];
    assert_eq!(owner, "u1");
    assert!(row.controllers.is_empty());
    assert!(reg.detach_controller("sock-a").is_empty());
}

#[test]
fn a_television_can_only_disconnect_its_own_remotes() {
    let reg = Registry::new();
    announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
    announce_ok(&reg, beat("tv-chambre-02", 0, None), "u1", None);
    reg.attach_controller("tv-salon-01", "sock-a", "iPhone", "u1", "alice", None).expect("attached");

    assert!(reg.kick_controller("tv-chambre-02", "sock-a").is_none());
    assert_eq!(reg.list("u1").iter().flat_map(|r| &r.controllers).count(), 1);
}

#[test]
fn a_phone_that_reconnects_replaces_itself_instead_of_doubling() {
    let reg = Registry::new();
    announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
    reg.attach_controller("tv-salon-01", "sock-old", "iPhone", "u1", "alice", None).expect("attached");

    let row = reg
        .attach_controller("tv-salon-01", "sock-new", "iPhone", "u1", "alice", None)
        .expect("attached");
    assert_eq!(row.controllers.len(), 1, "one device, one row");
    assert_eq!(row.controllers[0].id, "sock-new");

    // A different device of the same account is a second remote, not a replay.
    let row = reg
        .attach_controller("tv-salon-01", "sock-ipad", "iPad", "u1", "alice", None)
        .expect("attached");
    assert_eq!(row.controllers.len(), 2);
}

#[test]
fn the_remote_list_is_bounded() {
    let reg = Registry::new();
    announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
    // Two sockets naming the same phone are one remote, so these must differ.
    for n in 0..MAX_CONTROLLERS {
        assert!(
            reg.attach_controller(
                "tv-salon-01",
                &format!("sock-{n}"),
                &format!("Phone {n}"),
                "u1",
                "alice",
                None
            )
            .is_some()
        );
    }
    assert!(
        reg.attach_controller("tv-salon-01", "sock-flood", "Phone flood", "u1", "alice", None)
            .is_none()
    );
    assert_eq!(reg.list("u1")[0].controllers.len(), MAX_CONTROLLERS);
}

#[test]
fn a_remote_for_a_receiver_that_is_gone_is_refused() {
    let reg = Registry::new();
    assert!(reg.attach_controller("tv-ghost-01", "sock-a", "iPhone", "u1", "alice", None).is_none());
    assert!(reg.kick_controller("tv-ghost-01", "sock-a").is_none());
}
