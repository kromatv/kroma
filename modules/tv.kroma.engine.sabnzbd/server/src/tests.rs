use super::*;
use crate::fake::FakeSabnzbd;

fn client(s: &FakeSabnzbd) -> Sabnzbd {
    Sabnzbd::new(&ClientDef {
        url: format!("{}/", s.base),
        api_key: "key".into(),
    })
}

fn usenet<'a>(url: &'a str, name: &'a str, label: &'a str) -> AddNzbReq<'a> {
    AddNzbReq {
        protocol: "usenet",
        url,
        name,
        label,
    }
}

fn healthy(target: &str) -> String {
    if target.contains("mode=version") {
        r#"{"version":"4.3.2"}"#.into()
    } else if target.contains("mode=addurl") {
        r#"{"status":true,"nzo_ids":["SABnzbd_nzo_a"]}"#.into()
    } else {
        r#"{"queue":{"slots":[]},"history":{"slots":[]}}"#.into()
    }
}

#[test]
fn test_reports_the_version_and_checks_the_key() {
    let s = FakeSabnzbd::start(healthy);

    assert_eq!(client(&s).test().unwrap(), "SABnzbd 4.3.2");

    let seen = s.requests();
    assert!(seen[0].starts_with("/api?") && seen[0].contains("mode=version"), "{seen:?}");
    assert!(seen[1].contains("mode=queue") && seen[1].contains("limit=0"), "{seen:?}");
    assert!(seen[1].contains("apikey=key"), "{seen:?}");
}

#[test]
fn a_rejected_key_is_an_error() {
    let s = FakeSabnzbd::start(|t| {
        if t.contains("mode=version") {
            r#"{"version":"4.3.2"}"#.into()
        } else {
            r#"{"status":false,"error":"API Key Incorrect"}"#.into()
        }
    });

    let err = client(&s).test().unwrap_err().to_string();

    assert_eq!(err, "SABnzbd: API Key Incorrect");
}

#[test]
fn a_missing_key_never_reaches_the_server() {
    let s = FakeSabnzbd::start(healthy);
    let engine = Sabnzbd::new(&ClientDef {
        url: s.base.clone(),
        api_key: " ".into(),
    });

    assert!(engine.test().is_err());
    assert!(s.requests().is_empty());
}

#[test]
fn add_sends_the_link_the_name_and_the_category() {
    let s = FakeSabnzbd::start(healthy);

    let id = client(&s).add(&usenet("http://idx/get.nzb", "The.Film", "kroma")).unwrap();

    assert_eq!(id, "SABnzbd_nzo_a");
    let sent = &s.requests()[0];
    assert!(sent.contains("mode=addurl"), "{sent}");
    assert!(sent.contains("nzbname=The.Film"), "{sent}");
    assert!(sent.contains("cat=kroma"), "{sent}");
}

#[test]
fn add_uses_the_default_category_when_there_is_no_label() {
    let s = FakeSabnzbd::start(healthy);

    client(&s).add(&usenet("http://idx/get.nzb", "", "")).unwrap();

    let sent = &s.requests()[0];
    assert!(sent.to_ascii_lowercase().contains("cat=%2a"), "{sent}");
    assert!(!sent.contains("nzbname"), "{sent}");
}

#[test]
fn add_refuses_a_torrent_and_an_unlabelled_release() {
    let s = FakeSabnzbd::start(healthy);

    for protocol in ["torrent", ""] {
        let req = AddNzbReq { protocol, ..usenet("magnet:?xt=urn:btih:AB", "", "") };

        let err = client(&s).add(&req).unwrap_err().to_string();

        assert_eq!(err, "SABnzbd downloads usenet releases only, this one is torrent");
    }
    assert!(s.requests().is_empty());
}

#[test]
fn add_fails_when_the_server_hands_back_no_id() {
    let s = FakeSabnzbd::start(|_| r#"{"status":false,"nzo_ids":[]}"#.into());

    let err = client(&s).add(&usenet("http://idx/get.nzb", "", "")).unwrap_err();

    assert_eq!(err.to_string(), "SABnzbd did not accept the NZB");
}

#[test]
fn status_reads_the_queue_first() {
    let s = FakeSabnzbd::start(|_| {
        r#"{"queue":{"kbpersec":"2.0","slots":[{"nzo_id":"n","status":"Downloading","filename":"A","mb":"10","mbleft":"5"}]}}"#.into()
    });

    let job = client(&s).status("n").unwrap().unwrap();

    assert_eq!(job.state, JobState::Downloading);
    assert_eq!(job.progress, 0.5);
    assert_eq!(s.requests().len(), 1);
    assert!(s.requests()[0].contains("nzo_ids=n"));
}

#[test]
fn status_falls_through_to_the_history() {
    let s = FakeSabnzbd::start(|t| {
        if t.contains("mode=history") {
            r#"{"history":{"slots":[{"nzo_id":"n","status":"Repairing","name":"A"}]}}"#.into()
        } else {
            r#"{"queue":{"slots":[]}}"#.into()
        }
    });

    let job = client(&s).status("n").unwrap().unwrap();

    assert_eq!(job.state, JobState::Processing);
}

#[test]
fn status_is_none_for_a_job_in_neither() {
    let s = FakeSabnzbd::start(healthy);

    assert_eq!(client(&s).status("gone").unwrap(), None);
}

#[test]
fn the_lifecycle_verbs_hit_their_endpoints() {
    let s = FakeSabnzbd::start(|_| r#"{"status":true,"nzo_ids":["n"]}"#.into());
    let engine = client(&s);

    engine.pause("n").unwrap();
    engine.resume("n").unwrap();
    engine.remove("n", true).unwrap();

    let seen = s.requests();
    assert!(seen[0].contains("mode=queue") && seen[0].contains("name=pause") && seen[0].contains("value=n"));
    assert!(seen[1].contains("name=resume"));
    assert!(seen[2].contains("mode=queue") && seen[2].contains("name=delete") && seen[2].contains("del_files=1"));
    assert!(seen[3].contains("mode=history") && seen[3].contains("name=delete") && seen[3].contains("del_files=1"));
}

#[test]
fn removing_a_job_the_server_does_not_know_is_not_an_error() {
    let s = FakeSabnzbd::start(|_| r#"{"status":false,"nzo_ids":[]}"#.into());

    client(&s).remove("gone", false).unwrap();

    assert!(s.requests()[1].contains("del_files=0"));
}
