use super::*;
use crate::db::imports::Window;
use crate::model::imports::{Report, Tally};

fn tally(read: u64, brought: u64, unmatched: u64) -> Tally {
    Tally {
        read,
        brought,
        unmatched,
    }
}

#[test]
fn the_report_counts_what_was_read_brought_and_unmatched_kind_by_kind() {
    let state = importing_from(&household());
    let stages = Recording {
        nothing_here: vec!["t2"],
        ..Default::default()
    };

    let ran = import(&state, &stages, &everything());

    assert_eq!(
        ran.import.report,
        Report {
            libraries: tally(2, 2, 0),
            users: tally(3, 3, 0),
            titles: tally(5, 3, 1),
            states: tally(5, 3, 1),
            plays: tally(5, 2, 1),
        }
    );
}

#[test]
fn a_title_that_matched_nothing_is_listed_once_by_its_name_and_its_file() {
    let state = importing_from(&household());
    let stages = Recording {
        nothing_here: vec!["t2"],
        ..Default::default()
    };

    let ran = import(&state, &stages, &everything());

    let window = Window {
        offset: 0,
        limit: 10,
    };
    let listed = db::imports::unmatched(&state.db, &ran.import.id, window).unwrap();
    assert_eq!(ran.import.unmatched_titles, 1);
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].title.as_deref(), Some("Ronin"));
    assert_eq!(listed[0].paths, vec!["/data/movies/Ronin/Ronin.mkv"]);
}

#[test]
fn progress_counts_each_read_of_the_other_server_to_the_last_one() {
    let state = importing_from(&household());

    let ran = import(&state, &Recording::default(), &everything());

    assert_eq!(ran.run.progress(), (6, 6));
}

#[test]
fn the_stages_of_this_build_bring_the_users_and_settle_nothing_else() {
    let state = importing_from(&household());

    let ran = import(&state, &super::super::stages::Core, &everything());

    let settled = records(&state);
    assert_eq!(
        ran.import.report,
        Report {
            libraries: tally(2, 0, 0),
            users: tally(3, 2, 0),
            titles: tally(5, 0, 0),
            states: tally(2, 0, 1),
            plays: tally(5, 0, 2),
        }
    );
    assert_eq!(settled.len(), 2);
    assert!(settled.iter().all(|record| record.starts_with("user|")));
}

#[test]
fn an_import_that_ends_logs_what_it_brought() {
    let state = importing_from(&household());

    import(&state, &Recording::default(), &kept(&["1"], &[]));

    let logs = db::list_job_logs(&state.db, "run-1", 10).unwrap();
    let last = logs.last().unwrap();
    assert_eq!(
        last.message,
        "import completed: brought 1 libraries, 0 users, 3 titles, 0 watch states and 0 plays"
    );
}
