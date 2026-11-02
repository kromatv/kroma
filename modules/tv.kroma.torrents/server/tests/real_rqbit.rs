#![cfg(not(target_family = "wasm"))]

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use kroma_torrent::{AddTorrentReq, DownloadClient, RqbitConfig, RqbitEngine, TorrentState};
use sha1::{Digest, Sha1};

const PIECE: usize = 16 * 1024;
const NAME: &str = "payload.bin";

fn free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port()
}

fn torrent_of(payload: &[u8]) -> Vec<u8> {
    let pieces: Vec<u8> = payload
        .chunks(PIECE)
        .flat_map(|chunk| {
            let mut hasher = Sha1::new();
            hasher.update(chunk);
            let digest: [u8; 20] = hasher.finalize().into();
            digest
        })
        .collect();
    let mut bytes = format!(
        "d4:infod6:lengthi{}e4:name{}:{NAME}12:piece lengthi{PIECE}e6:pieces{}:",
        payload.len(),
        NAME.len(),
        pieces.len()
    )
    .into_bytes();
    bytes.extend_from_slice(&pieces);
    bytes.extend_from_slice(b"ee");
    bytes
}

fn sha1_of_info(torrent: &[u8]) -> String {
    let start = b"d4:info".len();
    let info = &torrent[start..torrent.len() - 1];
    let mut hasher = Sha1::new();
    hasher.update(info);
    let digest: [u8; 20] = hasher.finalize().into();
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn config(program: String, root: &Path, api_port: u16) -> RqbitConfig {
    RqbitConfig {
        program,
        session_dir: root.join("session"),
        download_dir: root.join("downloads"),
        work_dir: root.join("adding"),
        sealed: true,
        api_port,
        ..RqbitConfig::default()
    }
}

fn until<T>(what: &str, mut ask: impl FnMut() -> Option<T>) -> T {
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        if let Some(answer) = ask() {
            return answer;
        }
        assert!(Instant::now() < deadline, "{what} did not happen in time");
        std::thread::sleep(Duration::from_millis(50));
    }
}

fn finished(client: &dyn DownloadClient, client_ref: &str) -> kroma_torrent::TorrentStatus {
    until("the check of the data on disk", || {
        client
            .status(client_ref)
            .ok()
            .flatten()
            .filter(|status| status.progress >= 1.0 && status.state == TorrentState::Seeding)
    })
}

struct World {
    _dir: kroma_module_sdk::testing::TempDir,
    root: PathBuf,
    folder: PathBuf,
    program: String,
    port: u16,
    payload: Vec<u8>,
    torrent: Vec<u8>,
}

fn world(tag: &str) -> Option<World> {
    let program = std::env::var("KROMA_TEST_RQBIT").ok()?;
    let dir = kroma_module_sdk::testing::temp_dir(tag);
    let root = dir.path().to_path_buf();
    let folder = root.join("downloads").join("one");
    std::fs::create_dir_all(&folder).unwrap();
    let payload: Vec<u8> = (0..PIECE * 3 + 7).map(|at| (at % 251) as u8).collect();
    std::fs::write(folder.join(NAME), &payload).unwrap();
    let torrent = torrent_of(&payload);
    Some(World {
        _dir: dir,
        root,
        folder,
        program,
        port: free_port(),
        payload,
        torrent,
    })
}

impl World {
    async fn engine(&self) -> Arc<RqbitEngine> {
        let cfg = config(self.program.clone(), &self.root, self.port);
        RqbitEngine::start(&cfg).await.unwrap()
    }

    fn add(&self, client: &dyn DownloadClient) -> String {
        client
            .add(&AddTorrentReq {
                magnet_or_url: "",
                download_dir: Some(self.folder.to_str().unwrap()),
                label: "kroma",
                only_files: None,
                torrent_bytes: Some(&self.torrent),
            })
            .unwrap()
    }
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs the real rqbit 9.1.0: set KROMA_TEST_RQBIT to its path"]
async fn the_real_helper_checks_a_torrent_on_disk_and_reports_it_finished() {
    let Some(world) = world("real-rqbit-add") else {
        return;
    };
    let engine = world.engine().await;
    let client = engine.client();

    let added = world.add(&*client);

    let done = finished(&*client, &added);
    assert!(client.test().unwrap().contains("9.1.0"));
    assert_eq!(done.size_bytes, world.payload.len() as u64);
    assert_eq!(done.files, [NAME]);
    engine.shutdown().await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs the real rqbit 9.1.0: set KROMA_TEST_RQBIT to its path"]
async fn the_real_helper_lists_a_torrent_without_adding_it() {
    let Some(world) = world("real-rqbit-list") else {
        return;
    };
    let engine = world.engine().await;
    let client = engine.client();

    let listed = client.list_files("", Some(&world.torrent)).unwrap();

    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].path, NAME);
    assert_eq!(listed[0].size_bytes, world.payload.len() as u64);
    assert!(
        client
            .status(&sha1_of_info(&world.torrent))
            .unwrap()
            .is_none()
    );
    engine.shutdown().await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs the real rqbit 9.1.0: set KROMA_TEST_RQBIT to its path"]
async fn the_real_helper_pauses_and_resumes_a_torrent() {
    let Some(world) = world("real-rqbit-pause") else {
        return;
    };
    let engine = world.engine().await;
    let client = engine.client();
    let added = world.add(&*client);
    finished(&*client, &added);

    client.pause(&added).unwrap();

    let paused = until("the pause", || {
        client
            .status(&added)
            .ok()
            .flatten()
            .filter(|status| status.state == TorrentState::Completed)
    });
    client.resume(&added).unwrap();
    assert_eq!(paused.progress, 1.0);
    assert_eq!(finished(&*client, &added).client_ref, added);
    engine.shutdown().await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs the real rqbit 9.1.0: set KROMA_TEST_RQBIT to its path"]
async fn a_restart_of_the_real_helper_finds_its_torrents_again() {
    let Some(world) = world("real-rqbit-restart") else {
        return;
    };
    let first = world.engine().await;
    let added = world.add(&*first.client());
    finished(&*first.client(), &added);
    first.shutdown().await;

    let second = world.engine().await;

    assert_eq!(finished(&*second.client(), &added).client_ref, added);
    second.shutdown().await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs the real rqbit 9.1.0: set KROMA_TEST_RQBIT to its path"]
async fn the_real_helper_removes_a_torrent_with_its_data() {
    let Some(world) = world("real-rqbit-remove") else {
        return;
    };
    let engine = world.engine().await;
    let client = engine.client();
    let added = world.add(&*client);
    finished(&*client, &added);

    client.remove(&added, true).unwrap();

    until("the removal", || {
        matches!(client.status(&added), Ok(None)).then_some(())
    });
    until("the data going", || {
        (!world.folder.join(NAME).exists()).then_some(())
    });
    engine.shutdown().await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs the real rqbit 9.1.0: set KROMA_TEST_RQBIT to its path"]
async fn the_real_api_refuses_a_caller_without_the_password() {
    let Some(world) = world("real-rqbit-auth") else {
        return;
    };
    let engine = world.engine().await;

    let answer = kroma_module_sdk::http::Fetch::new()
        .purpose("probe")
        .get(&format!("http://127.0.0.1:{}/torrents", world.port))
        .unwrap();

    assert_eq!(answer.status, 401);
    engine.shutdown().await;
}
