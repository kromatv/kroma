use std::time::Duration;

use super::test_support::{StubApi, dumping_to, engine_over, helper_script, read_dump};
use super::*;

const ROOT: &str = "GET /";
const ANSWERS: &str = r#"{"server":"rqbit","version":"9.1.0"}"#;

fn config_for(helper: &std::path::Path, stub_port: u16, dir: &std::path::Path) -> RqbitConfig {
    RqbitConfig {
        program: helper.to_string_lossy().into_owned(),
        session_dir: dir.join("session"),
        download_dir: dir.join("downloads"),
        work_dir: dir.join("adding"),
        api_port: stub_port,
        ..RqbitConfig::default()
    }
}

#[tokio::test]
async fn a_start_ends_once_the_api_answers_and_names_the_version() {
    let dir = kroma_module_sdk::testing::temp_dir("rqbit-start");
    let stub = StubApi::serving(&[(ROOT, 200, ANSWERS)]);
    let helper = helper_script(dir.path(), "exec sleep 30");

    let engine = RqbitEngine::start(&config_for(&helper, stub.port, dir.path()))
        .await
        .unwrap();

    assert_eq!(engine.version, "9.1.0");
    assert_eq!(engine.exited(), None);
    assert!(dir.path().join("downloads").is_dir());
    engine.child.kill();
}

#[tokio::test]
async fn a_helper_that_exits_before_answering_fails_the_start_with_what_it_said() {
    let dir = kroma_module_sdk::testing::temp_dir("rqbit-exit");
    let stub = StubApi::serving(&[]);
    let helper = helper_script(dir.path(), "echo 'error binding: in use' >&2\nexit 3");

    let failed = RqbitEngine::start(&config_for(&helper, stub.port, dir.path()))
        .await
        .err()
        .unwrap();

    let reason = format!("{failed:#}");
    assert!(reason.contains("code 3"), "{reason}");
    assert!(reason.contains("error binding"), "{reason}");
}

#[tokio::test]
async fn a_helper_that_cannot_start_fails_the_start_rather_than_waiting() {
    let dir = kroma_module_sdk::testing::temp_dir("rqbit-absent");
    let stub = StubApi::serving(&[]);
    let missing = dir.path().join("not-here");

    let failed = RqbitEngine::start(&config_for(&missing, stub.port, dir.path())).await;

    assert!(failed.is_err());
}

#[tokio::test]
async fn the_password_travels_in_the_environment_and_the_proxy_with_it() {
    let dir = kroma_module_sdk::testing::temp_dir("rqbit-env");
    let stub = StubApi::serving(&[(ROOT, 200, ANSWERS)]);
    let dump = dir.path().join("dump");
    let helper = helper_script(dir.path(), &dumping_to(&dump));
    let cfg = RqbitConfig {
        socks_proxy_url: Some("{gateway:peers}".into()),
        ..config_for(&helper, stub.port, dir.path())
    };

    let engine = RqbitEngine::start(&cfg).await.unwrap();

    let command = read_dump(&dump);
    let (args, env) = command.split_once("server\nstart\n").unwrap();
    let basic = stub.seen(ROOT).remove(0).head.to_lowercase();
    assert!(
        env.contains("RQBIT_HTTP_BASIC_AUTH_USERPASS=kroma:"),
        "{env}"
    );
    assert!(
        env.contains("RQBIT_SOCKS_PROXY_URL={gateway:peers}"),
        "{env}"
    );
    assert!(!args.contains("kroma:"), "{args}");
    assert!(!args.contains("gateway"), "{args}");
    assert!(basic.contains("authorization: basic "), "{basic}");
    engine.child.kill();
}

#[tokio::test]
async fn a_start_clears_a_persisted_torrent_that_cannot_restore_first() {
    let dir = kroma_module_sdk::testing::temp_dir("rqbit-prune");
    let session = dir.path().join("session");
    std::fs::create_dir_all(&session).unwrap();
    std::fs::write(
        session.join("session.json"),
        r#"{"torrents":{"0":{"info_hash":"aa","is_paused":false}}}"#,
    )
    .unwrap();
    let stub = StubApi::serving(&[(ROOT, 200, ANSWERS)]);
    let helper = helper_script(dir.path(), "exec sleep 30");

    let engine = RqbitEngine::start(&config_for(&helper, stub.port, dir.path()))
        .await
        .unwrap();

    let store = std::fs::read_to_string(session.join("session.json")).unwrap();
    assert!(!store.contains("aa"), "{store}");
    engine.child.kill();
}

#[tokio::test]
async fn a_shutdown_waits_for_the_helper_to_end() {
    let stub = StubApi::serving(&[]);
    let engine = engine_over(&stub, RqbitConfig::default());

    engine.shutdown().await;

    assert!(engine.exited().is_some());
}

#[test]
fn a_dead_helper_reads_as_exited() {
    let stub = StubApi::serving(&[]);
    let engine = engine_over(&stub, RqbitConfig::default());

    engine.child.kill();

    assert!(
        engine
            .child
            .wait_for(Duration::from_secs(5))
            .unwrap()
            .is_some()
    );
    assert!(engine.exited().is_some());
}

#[test]
fn a_ceiling_the_helper_started_with_counts_as_applied() {
    assert_eq!(wanted_limits(Some(0), Some(7)), (None, Some(7)));
}

#[test]
fn each_start_presents_a_new_peer_id_in_the_clients_own_shape() {
    let (first, second) = (fresh_peer_id(), fresh_peer_id());

    assert_ne!(first, second);
    assert!(first.starts_with(b"-rQ9100-"));
    assert!(first.iter().all(u8::is_ascii_graphic));
}

#[test]
fn colors_come_off_what_the_helper_said() {
    assert_eq!(without_colors("\u{1b}[2mwhen\u{1b}[0m what"), "when what");
}
