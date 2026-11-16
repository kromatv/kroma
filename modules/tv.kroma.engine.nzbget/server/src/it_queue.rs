use serde_json::{json, Value};

use crate::fake_nzbget::{FakeNzbGet, Reply};
use crate::JobState;

fn queued(id: i64, status: &str) -> Value {
    json!({
        "NZBID": id,
        "NZBName": "Some.Show.S01E01",
        "Status": status,
        "DestDir": "/data/dst",
        "FileSizeLo": 1_000,
        "RemainingSizeLo": 500,
    })
}

fn finished(id: i64, status: &str) -> Value {
    json!({
        "NZBID": id,
        "Name": "Some.Show.S01E01",
        "Status": status,
        "DestDir": "/data/dst",
        "FinalDir": "/data/final",
        "FileSizeLo": 1_000,
        "DownloadedSizeLo": 1_000,
    })
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn a_downloading_group_takes_the_server_rate() {
    let fake = FakeNzbGet::start(|method, _| match method {
        "listgroups" => Reply::ok(json!([queued(3, "QUEUED"), queued(7, "DOWNLOADING")])),
        "status" => Reply::ok(json!({ "DownloadRateLo": 3_000_000, "DownloadRateHi": 0 })),
        _ => Reply::fault("unexpected"),
    });

    let got = fake.client().status("7").unwrap().expect("a known job");

    assert_eq!(got.state, JobState::Downloading);
    assert_eq!(got.progress, 0.5);
    assert_eq!(got.down_bps, 3_000_000);
    assert_eq!(got.client_ref, "7");
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn a_queued_group_does_not_ask_for_the_rate() {
    let fake = FakeNzbGet::start(|method, _| match method {
        "listgroups" => Reply::ok(json!([queued(7, "QUEUED")])),
        _ => Reply::fault("unexpected"),
    });

    let got = fake.client().status("7").unwrap().unwrap();

    assert_eq!(got.state, JobState::Queued);
    assert_eq!(fake.calls().len(), 1);
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn a_group_in_post_processing_is_processing_and_never_completed() {
    let fake = FakeNzbGet::start(|method, _| match method {
        "listgroups" => Reply::ok(json!([queued(7, "UNPACKING")])),
        _ => Reply::fault("unexpected"),
    });

    let got = fake.client().status("7").unwrap().unwrap();

    assert_eq!(got.state, JobState::Processing);
    assert_eq!(got.progress, 1.0);
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn a_job_out_of_the_queue_is_read_from_the_history() {
    let fake = FakeNzbGet::start(|method, params| match method {
        "listgroups" => Reply::ok(json!([])),
        "history" => {
            assert_eq!(params, &json!([false]));
            Reply::ok(json!([finished(5, "FAILURE/PAR"), finished(7, "SUCCESS/ALL")]))
        }
        _ => Reply::fault("unexpected"),
    });

    let got = fake.client().status("7").unwrap().unwrap();

    assert_eq!(got.state, JobState::Completed);
    assert_eq!(got.save_path.as_deref(), Some("/data/final"));
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn a_failed_history_item_is_failed_with_the_status_as_its_error() {
    let fake = FakeNzbGet::start(|method, _| match method {
        "listgroups" => Reply::ok(json!([])),
        _ => Reply::ok(json!([finished(7, "FAILURE/HEALTH")])),
    });

    let got = fake.client().status("7").unwrap().unwrap();

    assert_eq!(got.state, JobState::Failed);
    assert!(got.error.unwrap().contains("FAILURE/HEALTH"));
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn status_is_none_for_an_id_in_neither_list() {
    let fake = FakeNzbGet::start(|_, _| Reply::ok(json!([])));

    assert!(fake.client().status("7").unwrap().is_none());
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn status_is_none_for_a_ref_that_is_not_an_id() {
    let fake = FakeNzbGet::start(|_, _| Reply::fault("unexpected"));

    assert!(fake.client().status("abc123").unwrap().is_none());
    assert!(fake.calls().is_empty());
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn pause_and_resume_edit_the_group() {
    let fake = FakeNzbGet::start(|_, _| Reply::ok(json!(true)));

    fake.client().pause("7").unwrap();
    fake.client().resume("7").unwrap();

    let calls = fake.calls();
    assert_eq!(calls[0].method, "editqueue");
    assert_eq!(calls[0].params, json!(["GroupPause", "", [7]]));
    assert_eq!(calls[1].params, json!(["GroupResume", "", [7]]));
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn a_pause_the_daemon_does_not_accept_is_an_error() {
    let fake = FakeNzbGet::start(|_, _| Reply::ok(json!(false)));

    let err = fake.client().pause("7").unwrap_err().to_string();

    assert!(err.contains("GroupPause"), "{err}");
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn remove_clears_the_queue_and_the_history() {
    let fake = FakeNzbGet::start(|_, _| Reply::ok(json!(true)));

    fake.client().remove("7", false).unwrap();

    let sent: Vec<Value> = fake.calls().into_iter().map(|c| c.params).collect();
    assert_eq!(
        sent,
        vec![json!(["GroupDelete", "", [7]]), json!(["HistoryDelete", "", [7]])]
    );
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn remove_with_data_uses_the_final_deletes() {
    let fake = FakeNzbGet::start(|_, _| Reply::ok(json!(true)));

    fake.client().remove("7", true).unwrap();

    let sent: Vec<Value> = fake.calls().into_iter().map(|c| c.params).collect();
    assert_eq!(
        sent,
        vec![
            json!(["GroupFinalDelete", "", [7]]),
            json!(["HistoryFinalDelete", "", [7]])
        ]
    );
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn removing_an_id_that_is_in_neither_list_is_not_an_error() {
    let fake = FakeNzbGet::start(|_, _| Reply::ok(json!(false)));

    fake.client().remove("7", false).unwrap();
}
