//! The programs a component starts. It names them, and only names its manifest
//! declares. A pinned helper is fetched here, into a folder the module cannot
//! write, and hashed again before each start, so what runs is what the manifest
//! pinned.

mod capture;
mod fetch;
mod instance_programs;
mod stale;
mod stop;
#[cfg(test)]
mod tests;

use std::collections::{BTreeMap, HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use kroma_http::egress::Gateway;
use kroma_module_manifest::Helper;
use kroma_wasm_host::{Command as Asked, Output, Processes};

use capture::{capture, drained, Captured};
pub(in crate::component) use instance_programs::InstancePrograms;

/// Under the data directory, and listed as reserved so no module can ask for it.
pub(crate) const HELPERS_DIR: &str = "helpers";

const POLL: Duration = Duration::from_millis(20);
const STOP_GRACE: Duration = Duration::from_secs(3);
const GATEWAY_PLACEHOLDER: &str = "{gateway:";
const KEPT_ENDED: usize = 32;
const MAX_BUSY: u32 = 10;

enum State {
    Running(Child),
    Ended(i32),
}

struct Spawned {
    state: State,
    stdout: Arc<Captured>,
    stderr: Arc<Captured>,
    pid: u32,
}

pub(super) struct Programs {
    module: String,
    module_dir: PathBuf,
    helpers_dir: PathBuf,
    allowed: Vec<String>,
    helpers: BTreeMap<String, Helper>,
    gateway: Gateway,
    may_run: bool,
    children: Mutex<HashMap<u64, Spawned>>,
    ended: Mutex<VecDeque<u64>>,
    next: AtomicU64,
    fetching: Mutex<()>,
}

fn signal(pid: u32, signal: libc::c_int) {
    let Ok(pid) = libc::pid_t::try_from(pid) else {
        return;
    };
    // SAFETY: kill takes no pointers, and a pid that has gone is reported, not undefined.
    let _ = unsafe { libc::kill(pid, signal) };
}

impl Programs {
    #[allow(clippy::too_many_arguments)]
    pub(in crate::component) fn new(
        module: &str,
        module_dir: PathBuf,
        helpers_dir: PathBuf,
        allowed: Vec<String>,
        helpers: BTreeMap<String, Helper>,
        gateway: Gateway,
        may_run: bool,
    ) -> Self {
        Self {
            module: module.to_string(),
            module_dir,
            helpers_dir,
            allowed,
            helpers,
            gateway,
            may_run,
            children: Mutex::new(HashMap::new()),
            ended: Mutex::new(VecDeque::new()),
            next: AtomicU64::new(0),
            fetching: Mutex::new(()),
        }
    }

    pub(super) fn check_allowed(&self, program: &str) -> Result<(), String> {
        if !self.may_run {
            return Err(format!(
                "{} may not start programs: a third-party module stays contained",
                self.module
            ));
        }
        if !self.allowed.iter().any(|allowed| allowed == program) {
            return Err(format!("{} does not declare {program} under permissions.run", self.module));
        }
        Ok(())
    }

    // The token stays here: a module names the purpose, and what starts is handed
    // a gateway URL the module itself never sees.
    fn with_gateway(&self, text: &str) -> String {
        let Some(at) = text.find(GATEWAY_PLACEHOLDER) else {
            return text.to_string();
        };
        let rest = &text[at + GATEWAY_PLACEHOLDER.len()..];
        let Some(end) = rest.find('}') else {
            return text.to_string();
        };
        let url = format!(
            "socks5://{}:{}@{}",
            &rest[..end],
            self.gateway.credential,
            self.gateway.address
        );
        format!("{}{url}{}", &text[..at], &rest[end + 1..])
    }

    fn note_ended(&self, child: u64) {
        let mut ended = self.ended.lock().unwrap_or_else(PoisonError::into_inner);
        ended.push_back(child);
        if ended.len() > KEPT_ENDED {
            if let Some(oldest) = ended.pop_front() {
                self.children
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner)
                    .remove(&oldest);
            }
        }
    }
}

impl Processes for Programs {
    fn ensure(&self, program: &str) -> Result<(), String> {
        self.check_allowed(program)?;
        match self.helpers.get(program) {
            Some(helper) => {
                let asset = self.asset_for(program, helper)?;
                self.fetch_helper(program, asset).map(|_| ())
            }
            None => self.resolve(program).map(|_| ()),
        }
    }

    fn spawn(&self, asked: Asked) -> Result<u64, String> {
        let binary = self.resolve(&asked.program)?;
        let kept = self
            .helpers
            .contains_key(&asked.program)
            .then(|| self.reap_stale(&asked.program));
        let mut command = Command::new(&binary);
        command
            .env_clear()
            .envs(crate::program_env::inherited(std::env::vars_os()))
            .args(asked.args.iter().map(|arg| self.with_gateway(arg)))
            .current_dir(asked.cwd.as_deref().map_or(self.module_dir.as_path(), Path::new))
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        for (name, value) in &asked.env {
            if !name.starts_with("LD_") && !name.starts_with("DYLD_") {
                command.env(name, self.with_gateway(value));
            }
        }
        let mut busy = 0;
        let mut child = loop {
            match command.spawn() {
                Err(error) if error.kind() == std::io::ErrorKind::ExecutableFileBusy && busy < MAX_BUSY => {
                    busy += 1;
                    std::thread::sleep(POLL);
                }
                spawned => break spawned.map_err(|error| format!("start {}: {error}", asked.program))?,
            }
        };
        let pid = child.id();
        if let Some(mut pids) = kept {
            pids.push(pid);
            self.note_pids(&asked.program, &pids);
        }
        let stdout = child.stdout.take().map(capture).unwrap_or_default();
        let stderr = child.stderr.take().map(capture).unwrap_or_default();
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        self.children.lock().unwrap_or_else(PoisonError::into_inner).insert(
            id,
            Spawned {
                state: State::Running(child),
                stdout,
                stderr,
                pid,
            },
        );
        tracing::info!(module = %self.module, program = %asked.program, pid, "started a program");
        Ok(id)
    }

    fn wait(&self, child: u64, timeout: Duration) -> Result<Option<i32>, String> {
        let started = Instant::now();
        loop {
            let (finished, streams) = {
                let mut children = self.children.lock().unwrap_or_else(PoisonError::into_inner);
                let spawned = children.get_mut(&child).ok_or("this program has been forgotten")?;
                let streams = (Arc::clone(&spawned.stdout), Arc::clone(&spawned.stderr));
                let finished = match &mut spawned.state {
                    State::Ended(code) => return Ok(Some(*code)),
                    State::Running(running) => match running.try_wait() {
                        Ok(Some(status)) => {
                            let code = status.code().unwrap_or(-1);
                            spawned.state = State::Ended(code);
                            Some(code)
                        }
                        Ok(None) => None,
                        Err(error) => return Err(error.to_string()),
                    },
                };
                (finished, streams)
            };
            if let Some(code) = finished {
                drained(&[&streams.0, &streams.1]);
                self.note_ended(child);
                return Ok(Some(code));
            }
            if started.elapsed() >= timeout {
                return Ok(None);
            }
            std::thread::sleep(POLL.min(timeout));
        }
    }

    fn read(&self, child: u64, which: Output, max_bytes: u32) -> Result<Vec<u8>, String> {
        let children = self.children.lock().unwrap_or_else(PoisonError::into_inner);
        let spawned = children.get(&child).ok_or("this program has been forgotten")?;
        let stream = match which {
            Output::Stdout => &spawned.stdout,
            Output::Stderr => &spawned.stderr,
        };
        Ok(stream.take(max_bytes as usize))
    }

    fn kill(&self, child: u64, force: bool) -> Result<(), String> {
        let children = self.children.lock().unwrap_or_else(PoisonError::into_inner);
        let spawned = children.get(&child).ok_or("this program has been forgotten")?;
        if matches!(spawned.state, State::Running(_)) {
            signal(spawned.pid, if force { libc::SIGKILL } else { libc::SIGTERM });
        }
        Ok(())
    }
}
