//! The module process lifecycle: spawning a sidecar on a free port, draining
//! its logs, and stopping it cleanly.

use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

use super::{check_manifest_schema, grant_json, LogSink, Supervisor, MODULE_BIN};

pub(crate) struct Proc {
    pub(crate) port: u16,
    child: Child,
}

impl Supervisor {
    /// Drop the bookkeeping for any module whose process has exited, saying so
    /// on that module's own log, and answer with the ids that had died. Nothing
    /// else notices an exit, so [`spawn`](Self::spawn) and the watchdog both go
    /// through here before deciding a module is running.
    pub fn reap_exited(&self) -> Vec<String> {
        let mut dead = Vec::new();
        let mut procs = self.procs.write().unwrap();
        procs.retain(|id, p| match p.child.try_wait() {
            Ok(Some(status)) => {
                dead.push(id.clone());
                tracing::error!(module = %id, %status, "module process exited on its own");
                false
            }
            // Still running, or the status could not be read (leave it alone
            // rather than tear down a module over a transient wait error).
            _ => true,
        });
        drop(procs);
        for id in &dead {
            self.say(id, "ERROR module process exited");
        }
        dead
    }

    /// Spawn a module process on a free localhost port; a no-op if already
    /// running, an error if the module ships no binary.
    pub fn spawn(&self, id: &str) -> anyhow::Result<u16> {
        // Before the already-running shortcut: an entry whose process is gone
        // would otherwise answer "running" forever.
        self.reap_exited();
        if let Some(p) = self.procs.read().unwrap().get(id) {
            return Ok(p.port);
        }
        let bin = self.dir(id).join(MODULE_BIN);
        if !bin.exists() {
            anyhow::bail!("module binary missing: {}", bin.display());
        }
        let port = free_port()?;
        let storage = self.storage_of(id);
        self.adopt_declared_tables(id, storage.as_ref());
        let piped = self.cfg.log_line.is_some();
        let stdio = || if piped { Stdio::piped() } else { Stdio::inherit() };
        let mut child = Command::new(&bin)
            .env("KROMA_MODULE_ID", id)
            .env("KROMA_MODULE_PORT", port.to_string())
            .env("KROMA_CORE_URL", &self.cfg.core_url)
            .env("KROMA_HOST_TOKEN", &self.cfg.host_token)
            .env("KROMA_DB_PATH", &self.cfg.db_path)
            .env("KROMA_DATA_DIR", &self.cfg.data_dir)
            // What the module may reach in the CORE database, as its manifest
            // declared it. A module that declared nothing gets an empty grant
            // rather than no variable, so the sidecar can tell "denied
            // everything" from "an older host that sent no grant at all".
            .env("KROMA_MODULE_GRANT", grant_json(storage.as_ref()))
            .stdout(stdio())
            .stderr(stdio())
            .spawn()?;
        if let Some(log_line) = &self.cfg.log_line {
            Self::drain_logs(&mut child, id, log_line);
        }
        // The check above cannot hold its lock across the spawn, so two callers
        // (the watchdog and an admin toggle) can both get here. Whoever loses
        // the insert takes its own child back down rather than overwriting the
        // entry, which would leave a process nobody can stop holding a port.
        let mut procs = self.procs.write().unwrap();
        if let Some(winner) = procs.get(id) {
            let winner_port = winner.port;
            drop(procs);
            ask_to_stop(id, &mut child);
            reap(id, &mut child, Instant::now() + STOP_GRACE);
            return Ok(winner_port);
        }
        let pid = child.id();
        procs.insert(id.to_string(), Proc { port, child });
        drop(procs);
        self.say(id, &format!("INFO starting module process on port {port}"));
        tracing::info!(module = %id, port, pid, "spawned module process");
        Ok(port)
    }

    fn drain_logs(child: &mut Child, id: &str, log_line: &LogSink) {
        for pipe in [
            child.stdout.take().map(|p| Box::new(p) as Box<dyn std::io::Read + Send>),
            child.stderr.take().map(|p| Box::new(p) as Box<dyn std::io::Read + Send>),
        ]
        .into_iter()
        .flatten()
        {
            let log_line = log_line.clone();
            let id = id.to_string();
            std::thread::spawn(move || {
                use std::io::BufRead;
                for line in std::io::BufReader::new(pipe).lines() {
                    match line {
                        Ok(line) => log_line(&id, &line),
                        Err(_) => break,
                    }
                }
            });
        }
    }

    /// Stop a module process, giving it the grace period to shut down cleanly.
    /// A no-op if not running. Blocking: call it off the async runtime.
    pub fn stop(&self, id: &str) {
        let Some(mut p) = self.procs.write().unwrap().remove(id) else { return };
        self.say(id, "INFO stopping module process");
        ask_to_stop(id, &mut p.child);
        reap(id, &mut p.child, Instant::now() + STOP_GRACE);
        self.say(id, "INFO module process stopped");
        tracing::info!(module = %id, "stopped module process");
    }

    /// Sidecars are plain child processes that survive their parent, so a
    /// shutdown skipping this leaves orphans holding their ports.
    ///
    /// Every module is asked to stop first and only then waited on, so the whole
    /// shutdown costs one grace period rather than one per module. Blocking:
    /// call it off the async runtime.
    pub fn stop_all(&self) {
        let mut procs: Vec<(String, Proc)> = self.procs.write().unwrap().drain().collect();
        for (id, p) in &mut procs {
            ask_to_stop(id, &mut p.child);
        }
        let deadline = Instant::now() + STOP_GRACE;
        for (id, p) in &mut procs {
            reap(id, &mut p.child, deadline);
            tracing::info!(module = %id, "stopped module process");
        }
    }

    /// Start one installed module, applying the same gates as boot: a stray
    /// `.kmod` for a built-in id never spawns (it would duplicate the in-core
    /// module), its `engines` are enforced, and a library module (no binary) is a
    /// successful no-op. This is what the admin enable toggle drives, so
    /// enabling a runtime module brings its process up without a restart.
    pub fn start_installed(&self, id: &str) -> anyhow::Result<()> {
        let manifest = self
            .installed_manifests()
            .into_iter()
            .find(|m| m.id == id)
            .ok_or_else(|| anyhow::anyhow!("'{id}' is not installed"))?;
        if self.cfg.reserved_ids.iter().any(|r| r == id) {
            anyhow::bail!("'{id}' shadows a built-in module; not spawning");
        }
        check_manifest_schema(id, &manifest)?;
        kroma_module_manifest::engines_satisfied(&manifest.engines, &self.cfg.server_version)
            .map_err(|reason| anyhow::anyhow!("'{id}' {reason}"))?;
        if !self.has_binary(id) {
            return Ok(());
        }
        self.spawn(id)?;
        Ok(())
    }
}

/// How long a sidecar gets to run its `on_disable` hooks before it is killed
/// outright. A module that supervises a child of its own (the remote module's
/// `cloudflared`) needs this window to take it down; SIGKILL orphans it and the
/// tunnel keeps serving with nothing left to stop it.
const STOP_GRACE: Duration = Duration::from_secs(6);
const STOP_POLL: Duration = Duration::from_millis(25);

/// Ask a module process to exit cleanly. Unix only: elsewhere the process has no
/// shutdown path and [`reap`] kills it once the grace period lapses.
fn ask_to_stop(id: &str, child: &mut Child) {
    #[cfg(unix)]
    {
        let pid = child.id() as i32;
        // SAFETY: `child` has not been waited on, so `pid` is still our
        // un-reaped child and cannot have been recycled onto another process.
        let sent = unsafe { libc::kill(pid, libc::SIGTERM) };
        if sent != 0 {
            tracing::warn!(module = %id, pid, "SIGTERM failed; will kill");
        }
    }
    #[cfg(not(unix))]
    let _ = (id, child);
}

/// Wait for a stopping child until `deadline`, then kill it. Always reaps, so no
/// zombie is left behind.
fn reap(id: &str, child: &mut Child, deadline: Instant) {
    loop {
        match child.try_wait() {
            Ok(Some(_)) => return,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(STOP_POLL),
            Ok(None) => break,
            Err(_) => break,
        }
    }
    tracing::warn!(module = %id, "module did not stop in time; killing");
    let _ = child.kill();
    let _ = child.wait();
}

fn free_port() -> anyhow::Result<u16> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
    Ok(listener.local_addr()?.port())
}
