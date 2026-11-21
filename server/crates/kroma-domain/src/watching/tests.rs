use super::*;

const YESTERDAY: i64 = 1_700_000_000;
const TODAY: i64 = YESTERDAY + 86_400;

fn stopped(position_ms: i64, at: i64) -> Watching {
    Watching {
        resume: Some(Resume {
            position_ms,
            duration_ms: Some(7_200_000),
            at,
        }),
        ..Default::default()
    }
}

fn watched(at: i64) -> Watching {
    Watching {
        watched_at: Some(at),
        ..Default::default()
    }
}

fn watched_and_stopped(watched_at: i64, position_ms: i64, at: i64) -> Watching {
    Watching {
        watched_at: Some(watched_at),
        ..stopped(position_ms, at)
    }
}

#[test]
fn a_resume_point_comes_to_a_title_nobody_started_here() {
    let here = Watching::default();
    let brought = stopped(5_025_000, YESTERDAY);

    let merged = here.merged_with(&brought);

    assert_eq!(merged, brought);
}

#[test]
fn a_resume_point_newer_than_the_one_here_replaces_it() {
    let here = stopped(600_000, YESTERDAY);
    let brought = stopped(1_200_000, TODAY);

    let merged = here.merged_with(&brought);

    assert_eq!(merged, brought);
}

#[test]
fn a_person_who_watched_further_here_is_not_moved_back() {
    let here = stopped(3_000_000, TODAY);
    let brought = stopped(1_200_000, YESTERDAY);

    let merged = here.merged_with(&brought);

    assert_eq!(merged, here);
}

#[test]
fn this_server_wins_a_tie() {
    let here = stopped(3_000_000, TODAY);

    let against_a_resume_point = here.merged_with(&stopped(1_200_000, TODAY));
    let against_a_flag = here.merged_with(&watched(TODAY));

    assert_eq!(against_a_resume_point, here);
    assert_eq!(against_a_flag, watched_and_stopped(TODAY, 3_000_000, TODAY));
}

#[test]
fn a_resume_point_older_than_the_watched_flag_here_does_not_come_back() {
    let here = watched(TODAY);
    let brought = stopped(1_200_000, YESTERDAY);

    let merged = here.merged_with(&brought);

    assert_eq!(merged, here);
}

#[test]
fn a_resume_point_newer_than_the_watched_flag_here_comes_over() {
    let here = watched(YESTERDAY);
    let brought = stopped(1_200_000, TODAY);

    let merged = here.merged_with(&brought);

    assert_eq!(merged, watched_and_stopped(YESTERDAY, 1_200_000, TODAY));
}

#[test]
fn a_watched_flag_older_than_the_resume_point_here_comes_and_leaves_it() {
    let here = stopped(600_000, TODAY);
    let brought = watched(YESTERDAY);

    let merged = here.merged_with(&brought);

    assert_eq!(merged, watched_and_stopped(YESTERDAY, 600_000, TODAY));
}

#[test]
fn a_title_finished_there_after_the_person_stopped_in_it_here_has_no_resume_point() {
    let here = stopped(600_000, YESTERDAY);
    let brought = watched(TODAY);

    let merged = here.merged_with(&brought);

    assert_eq!(merged, watched(TODAY));
}

#[test]
fn a_title_started_again_there_after_it_was_finished_keeps_its_new_resume_point() {
    let here = stopped(600_000, YESTERDAY);
    let brought = watched_and_stopped(TODAY, 1_200_000, TODAY);

    let merged = here.merged_with(&brought);

    assert_eq!(merged, brought);
}

#[test]
fn a_flag_that_does_not_come_over_takes_no_resume_point_away() {
    let finished_here = watched_and_stopped(TODAY, 7_000_000, YESTERDAY);
    let brought = watched(YESTERDAY + 3600);

    let merged = finished_here.merged_with(&brought);

    assert_eq!(merged, finished_here);
}

#[test]
fn a_newer_watched_flag_moves_the_one_here_forward() {
    let here = watched(YESTERDAY);

    let newer = here.merged_with(&watched(TODAY));
    let older = watched(TODAY).merged_with(&watched(YESTERDAY));

    assert_eq!(newer, watched(TODAY));
    assert_eq!(older, watched(TODAY));
}

#[test]
fn a_title_unwatched_there_takes_nothing_away_here() {
    let here = Watching {
        listed: true,
        ..watched_and_stopped(YESTERDAY, 600_000, YESTERDAY)
    };
    let brought = Watching::default();

    let merged = here.merged_with(&brought);

    assert_eq!(merged, here);
}

#[test]
fn a_favourite_joins_the_list_and_stays_on_it() {
    let favourite = Watching {
        listed: true,
        ..Default::default()
    };

    let joined = Watching::default().merged_with(&favourite);
    let stayed = favourite.merged_with(&Watching::default());

    assert_eq!(joined, favourite);
    assert_eq!(stayed, favourite);
}

#[test]
fn a_state_nobody_dated_fills_only_what_is_empty_here() {
    let undated = watched_and_stopped(0, 1_200_000, 0);

    let onto_nothing = Watching::default().merged_with(&undated);
    let onto_a_resume_point = stopped(600_000, YESTERDAY).merged_with(&undated);

    assert_eq!(onto_nothing, undated);
    assert_eq!(
        onto_a_resume_point,
        watched_and_stopped(0, 600_000, YESTERDAY)
    );
}

#[test]
fn merging_the_same_state_twice_changes_nothing_the_second_time() {
    let here = stopped(600_000, YESTERDAY);
    let brought = Watching {
        listed: true,
        ..watched_and_stopped(TODAY, 1_200_000, TODAY)
    };
    let merged = here.merged_with(&brought);

    let again = merged.merged_with(&brought);

    assert_eq!(merged, brought);
    assert_eq!(again, merged);
}

fn removed_on(at: i64) -> Removed {
    Removed {
        watched: Some(at),
        resume: Some(at),
        listed: Some(at),
    }
}

#[test]
fn a_part_removed_here_at_or_after_its_time_there_does_not_come_back() {
    let brought = Watching {
        listed: true,
        ..watched_and_stopped(YESTERDAY, 1_200_000, YESTERDAY)
    };

    let at_the_removal = brought.newer_than(&removed_on(YESTERDAY));
    let after_it = brought.newer_than(&removed_on(TODAY));

    assert_eq!(at_the_removal, Watching::default());
    assert_eq!(after_it, Watching::default());
}

#[test]
fn a_part_the_other_server_recorded_after_the_removal_comes_back() {
    let brought = Watching {
        listed: true,
        ..watched_and_stopped(TODAY, 1_200_000, TODAY)
    };

    let kept = brought.newer_than(&removed_on(YESTERDAY));

    assert_eq!(kept, brought);
}

#[test]
fn only_the_part_a_person_removed_is_held_back() {
    let brought = Watching {
        listed: true,
        ..watched_and_stopped(YESTERDAY, 1_200_000, YESTERDAY)
    };
    let unwatched_today = Removed {
        watched: Some(TODAY),
        ..Removed::default()
    };

    let kept = brought.newer_than(&unwatched_today);

    assert_eq!(
        kept,
        Watching {
            listed: true,
            ..stopped(1_200_000, YESTERDAY)
        }
    );
}

#[test]
fn a_favourite_with_no_time_of_its_own_stays_removed() {
    let favourite = Watching {
        listed: true,
        ..Default::default()
    };
    let unlisted = Removed {
        listed: Some(YESTERDAY),
        ..Removed::default()
    };

    let kept = favourite.newer_than(&unlisted);

    assert_eq!(kept, Watching::default());
}
