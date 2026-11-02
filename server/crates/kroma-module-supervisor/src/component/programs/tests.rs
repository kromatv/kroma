use super::fetch::{make_executable, on_path, platform, sha256_of};
use kroma_module_manifest::HelperAsset;

use super::*;

fn gateway() -> Gateway {
    Gateway {
        address: "127.0.0.1:9".to_string(),
        credential: "secret".to_string(),
    }
}

fn programs(dir: &Path, allowed: &[&str], may_run: bool) -> Programs {
    Programs::new(
        "tv.example",
        dir.to_path_buf(),
        dir.join("helpers"),
        allowed.iter().map(ToString::to_string).collect(),
        BTreeMap::new(),
        gateway(),
        may_run,
    )
}

fn asked(program: &str, args: &[&str]) -> Asked {
    Asked {
        program: program.to_string(),
        args: args.iter().map(ToString::to_string).collect(),
        env: Vec::new(),
        cwd: None,
    }
}

#[test]
fn a_program_the_manifest_does_not_name_does_not_start() {
    let dir = kroma_testing::temp_dir("programs-undeclared");
    let programs = programs(dir.path(), &["echo"], true);

    let started = programs.spawn(asked("sh", &["-c", "true"]));

    assert!(started.unwrap_err().contains("does not declare"));
}

#[test]
fn a_contained_third_party_module_starts_nothing() {
    let dir = kroma_testing::temp_dir("programs-contained");
    let programs = programs(dir.path(), &["echo"], false);

    let started = programs.spawn(asked("echo", &["hi"]));

    assert!(started.unwrap_err().contains("contained"));
}

#[test]
fn a_declared_program_runs_and_its_output_comes_back() {
    let dir = kroma_testing::temp_dir("programs-echo");
    let programs = programs(dir.path(), &["echo"], true);

    let child = programs.spawn(asked("echo", &["hello"])).unwrap();
    let code = programs.wait(child, Duration::from_secs(5)).unwrap();
    std::thread::sleep(POLL);
    let output = programs.read(child, Output::Stdout, 1024).unwrap();

    assert_eq!(code, Some(0));
    assert_eq!(output, b"hello\n");
}

#[test]
fn a_placeholder_becomes_the_gateway_with_a_token_the_module_never_saw() {
    let dir = kroma_testing::temp_dir("programs-gateway");
    let programs = programs(dir.path(), &[], true);

    let filled = programs.with_gateway("--socks-url={gateway:peers.public}");

    assert_eq!(filled, "--socks-url=socks5://peers.public:secret@127.0.0.1:9");
}

#[test]
fn stopping_ends_what_is_still_running() {
    let dir = kroma_testing::temp_dir("programs-stop");
    let programs = programs(dir.path(), &["sleep"], true);
    let child = programs.spawn(asked("sleep", &["30"])).unwrap();

    programs.stop_all();
    let code = programs.wait(child, Duration::from_secs(1)).unwrap();

    assert!(code.is_some());
}

#[test]
fn what_an_earlier_server_left_of_a_helper_is_stopped_and_what_this_one_runs_is_not() {
    let dir = kroma_testing::temp_dir("programs-stale");
    let helpers_dir = dir.path().join("helpers");
    std::fs::create_dir_all(&helpers_dir).unwrap();
    let script = helpers_dir.join("stand-in");
    std::fs::copy(on_path("sleep").unwrap(), &script).unwrap();
    make_executable(&script).unwrap();
    let sha = sha256_of(&script).unwrap();
    std::fs::write(helpers_dir.join("stand-in.sha256"), &sha).unwrap();
    let mut helpers = BTreeMap::new();
    helpers.insert(
        "stand-in".to_string(),
        Helper {
            assets: BTreeMap::from([(
                platform(),
                HelperAsset {
                    url: "http://127.0.0.1:9/".to_string(),
                    sha256: sha,
                    member: None,
                },
            )]),
        },
    );
    let programs_for = |helpers| {
        Programs::new(
            "tv.example",
            dir.path().to_path_buf(),
            helpers_dir.clone(),
            vec!["stand-in".to_string()],
            helpers,
            gateway(),
            true,
        )
    };
    let earlier = std::mem::ManuallyDrop::new(programs_for(helpers.clone()));
    let left = earlier.spawn(asked("stand-in", &["30"])).unwrap();
    let later = programs_for(helpers);
    let current = later.spawn(asked("stand-in", &["30"])).unwrap();
    let current_pid = later.children.lock().unwrap()[&current].pid;

    later.reap_all_stale();

    let recorded = std::fs::read_to_string(later.pid_file("stand-in")).unwrap();
    assert_eq!(recorded.trim(), current_pid.to_string());
    assert!(earlier.wait(left, Duration::from_secs(2)).unwrap().is_some());
    assert_eq!(later.wait(current, Duration::ZERO).unwrap(), None);
}

#[test]
fn a_helper_with_no_build_for_this_platform_is_refused() {
    let dir = kroma_testing::temp_dir("programs-platform");
    let mut helpers = BTreeMap::new();
    helpers.insert("wg".to_string(), Helper::default());
    let programs = Programs::new(
        "tv.example",
        dir.path().to_path_buf(),
        dir.path().join("helpers"),
        vec!["wg".to_string()],
        helpers,
        gateway(),
        true,
    );

    let ensured = programs.ensure("wg");

    assert!(ensured.unwrap_err().contains("no build"));
}

#[test]
fn what_an_instance_started_stops_when_the_instance_goes() {
    let dir = kroma_testing::temp_dir("programs-instance-gone");
    let programs = Arc::new(programs(dir.path(), &["sleep"], true));
    let instance = InstancePrograms::new(programs.clone());
    let child = instance.spawn(asked("sleep", &["30"])).unwrap();

    drop(instance);

    assert!(programs.wait(child, Duration::ZERO).unwrap().is_some());
}

#[test]
fn an_instance_going_leaves_what_another_started_running() {
    let dir = kroma_testing::temp_dir("programs-instance-other");
    let programs = Arc::new(programs(dir.path(), &["sleep"], true));
    let kept = InstancePrograms::new(programs.clone());
    let gone = InstancePrograms::new(programs.clone());
    let child = kept.spawn(asked("sleep", &["30"])).unwrap();

    drop(gone);

    assert_eq!(programs.wait(child, Duration::ZERO).unwrap(), None);
    assert!(kept.any_running());
}

#[test]
fn an_instance_runs_something_only_while_one_of_its_programs_does() {
    let dir = kroma_testing::temp_dir("programs-instance-running");
    let programs = Arc::new(programs(dir.path(), &["sleep"], true));
    let instance = InstancePrograms::new(programs.clone());
    let child = instance.spawn(asked("sleep", &["30"])).unwrap();
    let while_running = instance.any_running();

    instance.kill(child, true).unwrap();
    programs.wait(child, Duration::from_secs(5)).unwrap();

    assert!(while_running);
    assert!(!instance.any_running());
}
