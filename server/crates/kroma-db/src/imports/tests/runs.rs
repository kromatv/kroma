use super::*;

#[test]
fn an_import_is_queued_with_what_the_owner_kept_and_the_reference_to_its_sign_in() {
    let p = pool();

    let queued = queue_at(&p, "i1", 5);

    let import = get(&p, "i1").unwrap().unwrap();
    assert!(queued);
    assert_eq!(import.status, Status::Queued);
    assert_eq!(import.importer, IMPORTER);
    assert_eq!(import.server, living_room());
    assert_eq!(import.sign_in.as_deref(), Some("s-1"));
    assert_eq!(import.selection, kept());
    assert_eq!(import.created_at, 5);
    assert_eq!(import.report, Report::default());
}

#[test]
fn a_second_import_is_refused_while_one_is_queued_or_running() {
    let p = pool();
    queue_at(&p, "i1", 1);

    let while_queued = queue_at(&p, "i2", 2);
    claim(&p, "run-1", 3).unwrap();
    let while_running = queue_at(&p, "i3", 4);
    end(&p, "i1", Status::Completed);
    let once_ended = queue_at(&p, "i4", 5);

    assert_eq!(
        (while_queued, while_running, once_ended),
        (false, false, true)
    );
    assert!(get(&p, "i2").unwrap().is_none());
}

#[test]
fn a_run_claims_the_queued_import_and_marks_it_running() {
    let p = pool();
    queue_at(&p, "i1", 1);

    let claimed = claim(&p, "run-1", 7).unwrap().unwrap();

    assert_eq!(claimed.id, "i1");
    assert_eq!(claimed.status, Status::Running);
    assert_eq!(claimed.run_id.as_deref(), Some("run-1"));
    assert_eq!(claimed.started_at, Some(7));
}

#[test]
fn a_run_with_no_import_queued_claims_nothing() {
    let p = pool();
    ran(&p, "i1", 1);

    let claimed = claim(&p, "run-2", 7).unwrap();

    assert_eq!(claimed, None);
}

#[test]
fn an_import_that_never_started_is_withdrawn_and_a_claimed_one_is_not() {
    let p = pool();
    queue_at(&p, "i1", 1);

    let never_started = withdraw(&p, "i1").unwrap();
    queue_at(&p, "i2", 2);
    claim(&p, "run-1", 3).unwrap();
    let claimed = withdraw(&p, "i2").unwrap();

    assert_eq!((never_started, claimed), (true, false));
    assert!(get(&p, "i1").unwrap().is_none());
    assert!(get(&p, "i2").unwrap().is_some());
}

#[test]
fn an_import_ends_with_its_status_its_report_and_why_it_failed() {
    let p = pool();
    queue_at(&p, "i1", 1);
    let mut report = Report::default();
    report.tally_mut(Kind::Title).read = 12;
    let failure = Failure {
        reason: FailureReason::ImporterFailed,
        message: Some("the other server did not answer".into()),
    };
    let ending = Ending {
        status: Status::Failed,
        failure: Some(&failure),
        report: &report,
        finished_ms: 9,
    };

    finish(&p, "i1", &ending).unwrap();

    let import = get(&p, "i1").unwrap().unwrap();
    assert_eq!(import.status, Status::Failed);
    assert_eq!(import.failure, Some(failure));
    assert_eq!(import.report, report);
    assert_eq!(import.finished_at, Some(9));
}

#[test]
fn a_running_import_shows_the_report_it_has_so_far() {
    let p = pool();
    queue_at(&p, "i1", 1);
    let mut report = Report::default();
    report.tally_mut(Kind::Play).read = 500;

    save_report(&p, "i1", &report).unwrap();

    assert_eq!(get(&p, "i1").unwrap().unwrap().report, report);
}

#[test]
fn a_restart_ends_the_import_it_cut_short_as_interrupted_and_leaves_the_ended_ones() {
    let p = pool();
    ran(&p, "i1", 1);
    queue_at(&p, "i2", 2);
    claim(&p, "run-2", 3).unwrap();

    let ended = fail_interrupted(&p, 8).unwrap();

    let cut_short = get(&p, "i2").unwrap().unwrap();
    assert_eq!(ended, 1);
    assert_eq!(cut_short.status, Status::Failed);
    assert_eq!(
        cut_short.failure.map(|failure| failure.reason),
        Some(FailureReason::Interrupted)
    );
    assert_eq!(cut_short.finished_at, Some(8));
    assert_eq!(get(&p, "i1").unwrap().unwrap().status, Status::Completed);
}

#[test]
fn forgetting_a_sign_in_drops_its_reference_from_that_importer_s_imports_alone() {
    let p = pool();
    ran(&p, "i1", 1);

    let elsewhere = forget_sign_in(&p, "tv.y.import", "s-1").unwrap();
    let another = forget_sign_in(&p, IMPORTER, "s-2").unwrap();
    let held_before = get(&p, "i1").unwrap().unwrap().sign_in;
    let forgotten = forget_sign_in(&p, IMPORTER, "s-1").unwrap();

    assert_eq!((elsewhere, another, forgotten), (0, 0, 1));
    assert_eq!(held_before.as_deref(), Some("s-1"));
    assert_eq!(get(&p, "i1").unwrap().unwrap().sign_in, None);
}

#[test]
fn imports_list_newest_first() {
    let p = pool();
    ran(&p, "i1", 1);
    ran(&p, "i2", 2);
    ran(&p, "i3", 3);

    let listed: Vec<String> = list(&p, 2)
        .unwrap()
        .into_iter()
        .map(|import| import.id)
        .collect();

    assert_eq!(listed, vec!["i3", "i2"]);
}

#[test]
fn pruning_drops_the_oldest_imports_and_keeps_the_record_of_what_they_brought() {
    let p = pool();
    ran(&p, "i1", 1);
    ran(&p, "i2", 2);
    let server_id = server_key(IMPORTER, "srv");
    let plays = Ledger {
        server_id: &server_id,
        kind: Kind::Play,
        scope: "",
    };
    record(&p, &plays, "i1", &[entry("p1", "f1", None)]).unwrap();
    add_unmatched(&p, "i1", &["t1"]).unwrap();

    prune(&p, 1).unwrap();

    let unmatched_rows: i64 = p
        .get()
        .unwrap()
        .query_row("SELECT COUNT(*) FROM import_unmatched", [], |r| r.get(0))
        .unwrap();
    assert!(get(&p, "i1").unwrap().is_none());
    assert!(get(&p, "i2").unwrap().is_some());
    assert_eq!(unmatched_rows, 0);
    assert_eq!(brought(&p, &plays, &["p1"]).unwrap().len(), 1);
}

#[test]
fn the_same_server_has_the_same_key_and_two_servers_never_share_one() {
    let again = server_key(IMPORTER, "srv");

    assert_eq!(server_key(IMPORTER, "srv"), again);
    assert_ne!(server_key(IMPORTER, "srv2"), again);
    assert_ne!(
        server_key("tv.x", ".import|srv"),
        server_key("tv.x.import", "srv")
    );
}

#[test]
fn a_server_takes_the_name_a_later_import_gives_and_keeps_it_when_none_is_given() {
    let p = pool();
    ran(&p, "i1", 1);
    let renamed = Origin {
        name: "Den".into(),
        ..living_room()
    };
    let unnamed = Origin {
        name: String::new(),
        ..living_room()
    };

    queue_from(&p, "i2", &renamed);
    end(&p, "i2", Status::Completed);
    queue_from(&p, "i3", &unnamed);

    assert_eq!(get(&p, "i2").unwrap().unwrap().server.name, "Den");
    assert_eq!(get(&p, "i3").unwrap().unwrap().server.name, "Den");
    assert_eq!(get(&p, "i1").unwrap().unwrap().server.name, "Den");
}
