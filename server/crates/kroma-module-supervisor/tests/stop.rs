//! Stopping a sidecar must ASK it to stop before killing it: a module that
//! supervises a child of its own (the remote module's `cloudflared`) only gets
//! to take that child down if it sees the signal, and a SIGKILLed sidecar leaves
//! the tunnel serving with nothing left to stop it.

#![cfg(unix)]

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use kroma_module_supervisor::{Supervisor, SupervisorConfig};

fn temp_modules_dir(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("kroma-sup-{tag}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
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
            "#!/bin/sh\ntrap 'echo stopped > {} ; exit 0' TERM\nwhile true; do sleep 0.05; done\n",
            marker.display()
        ),
    )
    .unwrap();
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755)).unwrap();
}

#[test]
fn stop_lets_a_module_shut_down_before_killing_it() {
    let dir = temp_modules_dir("stop");
    let marker = dir.join("stopped.txt");
    install_module(&dir, "com.example.stub", &marker);
    let sup = supervisor(&dir);

    sup.spawn("com.example.stub").expect("spawn");
    // The shell has to install its trap before the signal lands, else it dies on
    // the default TERM action and proves nothing.
    std::thread::sleep(Duration::from_millis(300));

    sup.stop("com.example.stub");
    assert!(marker.exists(), "the module was killed without a chance to shut down");
    assert!(sup.port_of("com.example.stub").is_none(), "a stopped module must be untracked");

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn stop_all_shuts_every_module_down() {
    let dir = temp_modules_dir("stopall");
    let markers: Vec<PathBuf> = (0..3).map(|i| dir.join(format!("stopped-{i}.txt"))).collect();
    for (i, marker) in markers.iter().enumerate() {
        install_module(&dir, &format!("com.example.stub{i}"), marker);
    }
    let sup = supervisor(&dir);
    for i in 0..3 {
        sup.spawn(&format!("com.example.stub{i}")).expect("spawn");
    }
    std::thread::sleep(Duration::from_millis(300));

    let started = Instant::now();
    sup.stop_all();
    for marker in &markers {
        assert!(marker.exists(), "{} never shut down", marker.display());
    }
    // Signalled together, waited on once: three modules must not cost three
    // grace periods.
    assert!(started.elapsed() < Duration::from_secs(5), "stop_all serialised the grace period");

    let _ = std::fs::remove_dir_all(&dir);
}

// The grace period is a deadline, not a promise: a wedged module still dies.
#[test]
fn stop_kills_a_module_that_ignores_the_signal() {
    let dir = temp_modules_dir("stubborn");
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

    let sup = supervisor(&dir);
    sup.spawn("com.example.deaf").expect("spawn");
    std::thread::sleep(Duration::from_millis(300));
    let pid: i32 = std::fs::read_to_string(&pidfile).expect("pidfile").trim().parse().unwrap();

    sup.stop("com.example.deaf");
    // `stop` reaps, so the pid is free; anything still answering signal 0 would
    // mean the process outlived the grace period.
    // SAFETY: `kill(pid, 0)` only probes for existence, it delivers no signal.
    assert_eq!(unsafe { libc::kill(pid, 0) }, -1, "a module ignoring SIGTERM was left running");

    let _ = std::fs::remove_dir_all(&dir);
}
