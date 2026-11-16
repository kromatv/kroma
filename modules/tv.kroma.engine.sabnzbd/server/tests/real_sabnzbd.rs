#![cfg(not(target_family = "wasm"))]

use std::time::{Duration, Instant};

use kroma_sabnzbd::{AddNzbReq, ClientDef, JobState, JobStatus, Sabnzbd};

const NEEDS: &str = "needs a running SABnzbd with a news server: set KROMA_TEST_SABNZBD_URL, KROMA_TEST_SABNZBD_KEY and KROMA_TEST_NZB_BASE";

fn env(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("{NEEDS}"))
}

fn sabnzbd(api_key: &str) -> Sabnzbd {
    Sabnzbd::new(&ClientDef {
        url: env("KROMA_TEST_SABNZBD_URL"),
        api_key: api_key.into(),
    })
}

fn add(sab: &Sabnzbd, nzb: &str, name: &str) -> String {
    let url = format!("{}/{nzb}", env("KROMA_TEST_NZB_BASE"));
    sab.add(&AddNzbReq {
        protocol: "usenet",
        url: &url,
        name,
        label: "",
    })
    .unwrap()
}

fn settled(sab: &Sabnzbd, id: &str) -> (JobStatus, Vec<JobState>) {
    let deadline = Instant::now() + Duration::from_secs(120);
    let mut seen: Vec<JobState> = Vec::new();
    loop {
        if let Some(job) = sab.status(id).unwrap() {
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
#[ignore = "needs a running SABnzbd with a news server"]
fn a_real_sabnzbd_downloads_an_nzb_through_to_completed_and_forgets_it_once_removed() {
    let sab = sabnzbd(&env("KROMA_TEST_SABNZBD_KEY"));

    let version = sab.test().unwrap();
    let id = add(&sab, "good.nzb", "Kroma.Test.2026.1080p.WEB-DL.x264-GRP");
    let (job, seen) = settled(&sab, &id);
    sab.remove(&id, true).unwrap();

    assert!(version.starts_with("SABnzbd "), "{version}");
    assert_eq!(job.state, JobState::Completed, "{seen:?} {:?}", job.error);
    assert_eq!(job.progress, 1.0);
    assert!(job.save_path.as_deref().is_some_and(|p| p.contains("Kroma.Test")), "{job:?}");
    assert_eq!(sab.status(&id).unwrap(), None);
}

#[test]
#[ignore = "needs a running SABnzbd with a news server"]
fn a_real_sabnzbd_fails_an_nzb_whose_articles_the_server_does_not_have() {
    let sab = sabnzbd(&env("KROMA_TEST_SABNZBD_KEY"));

    let id = add(&sab, "missing.nzb", "Kroma.Missing.2026.1080p.WEB-DL.x264-GRP");
    let (job, seen) = settled(&sab, &id);
    sab.remove(&id, true).unwrap();

    assert_eq!(job.state, JobState::Failed, "{seen:?}");
    assert!(job.error.as_deref().is_some_and(|e| !e.is_empty()), "{job:?}");
    assert_eq!(job.save_path, None);
}

#[test]
#[ignore = "needs a running SABnzbd with a news server"]
fn a_real_sabnzbd_refuses_a_wrong_api_key_on_test() {
    let sab = sabnzbd("not-the-key");

    let refused = sab.test();

    assert!(refused.is_err(), "{refused:?}");
}
