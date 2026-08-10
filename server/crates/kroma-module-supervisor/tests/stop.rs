//! Stopping a sidecar must ASK it to stop before killing it: a module that
//! supervises a child of its own (the remote module's `cloudflared`) only gets
//! to take that child down if it sees the signal, and a SIGKILLed sidecar leaves
//! the tunnel serving with nothing left to stop it.

#![cfg(unix)]

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use kroma_module_supervisor::{Supervisor, SupervisorConfig};

fn temp_modules_dir(tag: &str) -> kroma_testing::TempDir {
    kroma_testing::temp_dir(&format!("sup-{tag}"))
}

fn supervisor(dir: &Path) -> std::sync::Arc<Supervisor> {
    Supervisor::new(SupervisorConfig {
        modules_dir: dir.to_path_buf(),
        core_url: "http://127.0.0.1:0".into(),
        host_token: "t".into(),
        db_path: dir.join("db.sqlite"),
        data_dir: dir.to_path_buf(),
        reserved_ids: Vec::new(),
        server_version: "0.1.4".into(),
        log_line: None,
    })
}

// A stand-in sidecar: on SIGTERM it does what a real module's `on_disable` does
// (release something outside the process; here, write a file) and then exits.
// It announces its own readiness, because a signal that arrives before the trap
// is installed kills the shell on the default action and proves nothing.
fn install_module(dir: &Path, id: &str, marker: &Path) {
    let module_dir = dir.join(id);
    std::fs::create_dir_all(&module_dir).unwrap();
    std::fs::write(
        module_dir.join("module.json"),
        format!(r#"{{ "id": "{id}", "name": "Stub", "version": "1.0.0" }}"#),
    )
    .unwrap();
    let bin = module_dir.join("module");
    std::fs::write(
        &bin,
        format!(
            "#!/bin/sh\ntrap 'echo stopped > {} ; exit 0' TERM\necho up > {}\nwhile true; do sleep 0.05; done\n",
            marker.display(),
            ready_flag(dir, id).display()
        ),
    )
    .unwrap();
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755)).unwrap();
}

fn ready_flag(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}.ready"))
}

// Waiting for the trap rather than sleeping for it: under the load of a full
// workspace run a fixed grace was not always enough, and the test failed for a
// reason it was not written to catch.
fn await_ready(path: &Path) {
    let deadline = Instant::now() + Duration::from_secs(10);
    while Instant::now() < deadline {
        if path.exists() {
            return;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    panic!("the stub never installed its trap: {}", path.display());
}

#[test]
fn stop_lets_a_module_shut_down_before_killing_it() {
    let scratch = temp_modules_dir("stop");
    let dir = scratch.path();
    let marker = dir.join("stopped.txt");
    install_module(dir, "com.example.stub", &marker);
    let sup = supervisor(dir);

    sup.spawn("com.example.stub").expect("spawn");
    await_ready(&ready_flag(dir, "com.example.stub"));

    sup.stop("com.example.stub");
    assert!(marker.exists(), "the module was killed without a chance to shut down");
    assert!(sup.port_of("com.example.stub").is_none(), "a stopped module must be untracked");
}

#[test]
fn stop_all_shuts_every_module_down() {
    let scratch = temp_modules_dir("stopall");
    let dir = scratch.path();
    let markers: Vec<PathBuf> = (0..3).map(|i| dir.join(format!("stopped-{i}.txt"))).collect();
    for (i, marker) in markers.iter().enumerate() {
        install_module(dir, &format!("com.example.stub{i}"), marker);
    }
    let sup = supervisor(dir);
    for i in 0..3 {
        sup.spawn(&format!("com.example.stub{i}")).expect("spawn");
    }
    for i in 0..3 {
        await_ready(&ready_flag(dir, &format!("com.example.stub{i}")));
    }

    let started = Instant::now();
    sup.stop_all();
    for marker in &markers {
        assert!(marker.exists(), "{} never shut down", marker.display());
    }
    // Signalled together, waited on once: three modules must not cost three
    // grace periods.
    assert!(started.elapsed() < Duration::from_secs(5), "stop_all serialised the grace period");
}

// The grace period is a deadline, not a promise: a wedged module still dies.
#[test]
fn stop_kills_a_module_that_ignores_the_signal() {
    let scratch = temp_modules_dir("stubborn");
    let dir = scratch.path();
    let module_dir = dir.join("com.example.deaf");
    std::fs::create_dir_all(&module_dir).unwrap();
    std::fs::write(
        module_dir.join("module.json"),
        r#"{ "id": "com.example.deaf", "name": "Deaf", "version": "1.0.0" }"#,
    )
    .unwrap();
    let pidfile = dir.join("deaf.pid");
    let bin = module_dir.join("module");
    std::fs::write(
        &bin,
        format!(
            "#!/bin/sh\ntrap '' TERM\necho $$ > {}\nwhile true; do sleep 0.05; done\n",
            pidfile.display()
        ),
    )
    .unwrap();
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755)).unwrap();

    let sup = supervisor(dir);
    sup.spawn("com.example.deaf").expect("spawn");
    await_ready(&pidfile);
    let pid: i32 = std::fs::read_to_string(&pidfile).expect("pidfile").trim().parse().unwrap();

    sup.stop("com.example.deaf");
    // `stop` reaps, so the pid is free; anything still answering signal 0 would
    // mean the process outlived the grace period.
    // SAFETY: `kill(pid, 0)` only probes for existence, it delivers no signal.
    assert_eq!(unsafe { libc::kill(pid, 0) }, -1, "a module ignoring SIGTERM was left running");
}
