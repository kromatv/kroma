use super::*;

#[test]
fn an_instance_idle_for_its_lifetime_is_dropped() {
    assert!(worth_dropping(false, WORKER_LIFETIME, WORKER_LIFETIME));
}

#[test]
fn an_instance_with_work_still_running_is_kept() {
    assert!(!worth_dropping(true, WORKER_LIFETIME * 10, WORKER_LIFETIME));
}

#[test]
fn an_instance_used_within_its_lifetime_is_kept() {
    assert!(!worth_dropping(false, WORKER_LIFETIME / 2, WORKER_LIFETIME));
}
