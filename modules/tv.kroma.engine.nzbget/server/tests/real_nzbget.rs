#![cfg(not(target_family = "wasm"))]

use std::time::{Duration, Instant};

use kroma_nzbget::{AddReq, ClientDef, JobState, JobStatus, NzbGet};

const NEEDS: &str = "needs a running NZBGet with a news server: set KROMA_TEST_NZBGET_URL, KROMA_TEST_NZBGET_USER, KROMA_TEST_NZBGET_PASSWORD and KROMA_TEST_NZB_BASE";

fn env(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("{NEEDS}"))
}

fn nzbget(password: &str) -> NzbGet {
    NzbGet::new(&ClientDef {
        url: env("KROMA_TEST_NZBGET_URL"),
        username: env("KROMA_TEST_NZBGET_USER"),
        password: password.into(),
    })
}

fn add(client: &NzbGet, nzb: &str, name: &str) -> String {
    let url = format!("{}/{nzb}", env("KROMA_TEST_NZB_BASE"));
    client
        .add(&AddReq {
            protocol: "usenet",
            url: &url,
            name,
            label: "",
        })
        .unwrap()
}

fn settled(client: &NzbGet, id: &str) -> (JobStatus, Vec<JobState>) {
    let deadline = Instant::now() + Duration::from_secs(120);
    let mut seen: Vec<JobState> = Vec::new();
    loop {
        if let Some(job) = client.status(id).unwrap() {
            if seen.last() != Some(&job.state) {
                seen.push(job.state);
            }
            if matches!(job.state, JobState::Completed | JobState::Failed) {
                return (job, seen);
            }
        }
        assert!(Instant::now() < deadline, "still {seen:?} after two minutes");
        std::thread::sleep(Duration::from_millis(200));
    }
}

#[test]
#[ignore = "needs a running NZBGet with a news server"]
fn a_real_nzbget_downloads_an_nzb_through_to_completed_and_forgets_it_once_removed() {
    let client = nzbget(&env("KROMA_TEST_NZBGET_PASSWORD"));

    let version = client.test().unwrap();
    let id = add(&client, "good.nzb", "Kroma.Test.2026.1080p.WEB-DL.x264-GRP");
    let (job, seen) = settled(&client, &id);
    client.remove(&id, true).unwrap();

    assert!(version.starts_with("NZBGet "), "{version}");
    assert_eq!(job.state, JobState::Completed, "{seen:?} {:?}", job.error);
    assert_eq!(job.progress, 1.0);
    assert!(job.save_path.as_deref().is_some_and(|p| p.contains("Kroma.Test")), "{job:?}");
    assert!(client.status(&id).unwrap().is_none());
}

#[test]
#[ignore = "needs a running NZBGet with a news server"]
fn a_real_nzbget_fails_an_nzb_whose_articles_the_server_does_not_have() {
    let client = nzbget(&env("KROMA_TEST_NZBGET_PASSWORD"));

    let id = add(&client, "missing.nzb", "Kroma.Missing.2026.1080p.WEB-DL.x264-GRP");
    let (job, seen) = settled(&client, &id);
    client.remove(&id, true).unwrap();

    assert_eq!(job.state, JobState::Failed, "{seen:?}");
    assert!(job.error.as_deref().is_some_and(|e| !e.is_empty()), "{job:?}");
}

#[test]
#[ignore = "needs a running NZBGet with a news server"]
fn a_real_nzbget_refuses_a_wrong_password_on_test() {
    let client = nzbget("not-the-password");

    let refused = client.test();

    assert!(refused.is_err(), "{refused:?}");
}
