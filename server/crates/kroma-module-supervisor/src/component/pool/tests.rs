use super::*;

const LARGE: usize = RECLAIM_ABOVE_BYTES + 1;

#[test]
fn a_large_instance_idle_long_enough_is_dropped() {
    assert!(worth_dropping(false, RECLAIM_AFTER, LARGE));
}

#[test]
fn an_instance_with_work_still_running_is_kept() {
    assert!(!worth_dropping(true, RECLAIM_AFTER * 10, LARGE));
}

#[test]
fn a_large_instance_used_recently_is_kept() {
    assert!(!worth_dropping(false, RECLAIM_AFTER / 2, LARGE));
}

#[test]
fn a_small_instance_is_kept_however_long_it_idles() {
    assert!(!worth_dropping(
        false,
        RECLAIM_AFTER * 10,
        RECLAIM_ABOVE_BYTES
    ));
}
