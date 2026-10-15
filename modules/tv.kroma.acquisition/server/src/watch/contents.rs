use std::time::{Duration, Instant};

use anyhow::{bail, Result};
use kroma_module_sdk::host::HostStorage;
use kroma_scene::Unwatchable;

use crate::peers::downloads::{self, DownloadRow, TorrentFileEntry};
use crate::search::CachedRelease;

use super::WatchRequest;

const CANDIDATES_TRIED: usize = 3;
const FILE_LIST_POLL: Duration = Duration::from_millis(250);

#[derive(Debug, PartialEq, Eq)]
enum FileList {
    Playable,
    Unplayable(Unwatchable),
    Unanswered,
}

#[derive(Debug, PartialEq, Eq)]
enum Refused {
    Held(Unwatchable),
    NotStarted(String),
}

#[derive(Debug)]
pub(super) enum Watchable {
    Grabbed(DownloadRow),
    Reused(DownloadRow),
}

pub(super) fn start_watchable<S: HostStorage + Clone>(
    host: &S,
    request: &WatchRequest,
    ranked: &[CachedRelease],
    deadline: Instant,
) -> Result<Watchable> {
    let mut refused: Vec<Refused> = Vec::new();
    for release in ranked.iter().take(CANDIDATES_TRIED) {
        let row = match started(host, request, release) {
            Ok(row) => row,
            Err(e) => {
                if let Ok(Some(row)) = super::live_download(host, request) {
                    return Ok(Watchable::Reused(row));
                }
                refused.push(Refused::NotStarted(format!("{e:#}")));
                continue;
            }
        };
        let (activating, id) = (host.clone(), row.id.clone());
        std::thread::spawn(move || downloads::activate(&activating, &id));
        match file_list(host, &row.id, deadline) {
            FileList::Playable | FileList::Unanswered => return Ok(Watchable::Grabbed(row)),
            FileList::Unplayable(unwatchable) => {
                downloads::remove(host, &row.id);
                refused.push(Refused::Held(unwatchable));
            }
        }
    }
    bail!("{}", nothing_to_play(&refused))
}

fn started<S: HostStorage + Clone>(
    host: &S,
    request: &WatchRequest,
    release: &CachedRelease,
) -> Result<DownloadRow> {
    downloads::grab(host, &super::grab_spec(host, release, request)?)
}

fn file_list<S: HostStorage>(host: &S, id: &str, deadline: Instant) -> FileList {
    loop {
        match downloads::files(host, id) {
            Err(_) => return FileList::Unanswered,
            Ok(listed) if !listed.is_empty() => return judge(listed),
            Ok(_) => {}
        }
        if Instant::now() + FILE_LIST_POLL >= deadline {
            return FileList::Unanswered;
        }
        std::thread::sleep(FILE_LIST_POLL);
    }
}

fn judge(listed: Vec<TorrentFileEntry>) -> FileList {
    let paths: Vec<(String, u64)> = listed
        .into_iter()
        .map(|file| (file.path, file.size_bytes))
        .collect();
    match kroma_scene::unwatchable(&kroma_scene::classify(&paths)) {
        Some(unwatchable) => FileList::Unplayable(unwatchable),
        None => FileList::Playable,
    }
}

fn nothing_to_play(refused: &[Refused]) -> String {
    let reasons: Vec<String> = refused.iter().map(what_stopped_it).collect();
    let plural = if refused.len() == 1 { "" } else { "s" };
    format!(
        "tried {} release{plural}, none offers a film to play while it arrives: {}",
        refused.len(),
        reasons.join(", ")
    )
}

fn what_stopped_it(refused: &Refused) -> String {
    match refused {
        Refused::Held(Unwatchable::DiscStructure) => "a disc rather than a film".into(),
        Refused::Held(Unwatchable::Archive) => "an archive rather than a film".into(),
        Refused::Held(Unwatchable::NoVideo) => "no video at all".into(),
        Refused::NotStarted(why) => format!("could not be started ({why})"),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use kroma_module_sdk::host::testing::StubHost;
    use serde_json::json;

    use super::super::test_support::{candidate, host_over, sintel, Peers};
    use super::*;

    #[tokio::test(flavor = "multi_thread")]
    async fn a_grab_the_queue_already_holds_resolves_to_the_download_that_holds_it() {
        let peers = Peers {
            live: Some(json!({
                "id": "d-first",
                "release_title": "Sintel (2010)",
                "status": "queued",
            })),
            refusals: HashMap::from([(
                "Sintel (2010)".to_string(),
                "this release is already in the queue (\"Sintel\", status: queued)".to_string(),
            )]),
            ..Peers::default()
        };
        let host = host_over(peers.clone()).await;
        let ranked = [
            candidate("Sintel (2010)"),
            candidate("Sintel (2010) Blu-ray"),
        ];
        let generous = Instant::now() + Duration::from_secs(60);

        let started = kroma_module_sdk::testing::blocking(move || {
            start_watchable(&host, &sintel(), &ranked, generous)
        })
        .await
        .unwrap();

        assert!(
            matches!(&started, Watchable::Reused(row) if row.id == "d-first"),
            "{started:?}"
        );
        assert_eq!(peers.grabbed().len(), 1);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_file_list_that_has_not_arrived_by_the_deadline_is_no_evidence_against_a_candidate() {
        let peers = Peers {
            contents: HashMap::from([("d1".to_string(), Vec::new())]),
            ..Peers::default()
        };
        let host = host_over(peers).await;

        let listed =
            kroma_module_sdk::testing::blocking(move || file_list(&host, "d1", Instant::now()))
                .await;

        assert_eq!(listed, FileList::Unanswered);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_peer_that_cannot_answer_with_a_file_list_costs_the_viewer_nothing() {
        let host = StubHost::new();
        let generous = Instant::now() + Duration::from_secs(60);

        let listed =
            kroma_module_sdk::testing::blocking(move || file_list(&host, "d1", generous)).await;

        assert_eq!(listed, FileList::Unanswered);
    }

    #[test]
    fn a_watch_that_tried_one_release_says_what_that_one_held() {
        let refused = [Refused::Held(Unwatchable::NoVideo)];

        assert_eq!(
            nothing_to_play(&refused),
            "tried 1 release, none offers a film to play while it arrives: no video at all"
        );
    }

    #[test]
    fn a_watch_names_what_each_candidate_held_in_the_order_it_tried_them() {
        let refused = [
            Refused::Held(Unwatchable::DiscStructure),
            Refused::Held(Unwatchable::Archive),
        ];

        assert_eq!(
            nothing_to_play(&refused),
            "tried 2 releases, none offers a film to play while it arrives: a disc rather than a film, an archive rather than a film"
        );
    }

    #[test]
    fn a_release_the_engine_would_not_take_names_why_beside_the_others() {
        let refused = [
            Refused::NotStarted("already in the queue (imported)".into()),
            Refused::Held(Unwatchable::Archive),
        ];

        assert_eq!(
            nothing_to_play(&refused),
            "tried 2 releases, none offers a film to play while it arrives: could not be started (already in the queue (imported)), an archive rather than a film"
        );
    }
}
