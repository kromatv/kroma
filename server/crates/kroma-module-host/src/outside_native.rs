//! [`Outside`] as the machine itself, for a module's tests on a developer's
//! machine. A component never links this.

use std::collections::HashMap;
use std::io::Read;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, LazyLock, Mutex, PoisonError};
use std::time::{Duration, Instant};

use crate::outside::{CommandSpec, LanReply, LanService, Outside};

const POLL: Duration = Duration::from_millis(10);
const DRAIN_GRACE: Duration = Duration::from_millis(500);
const MAX_BUSY: u32 = 20;

#[derive(Default)]
struct Captured {
    bytes: Mutex<Vec<u8>>,
    closed: std::sync::atomic::AtomicBool,
}

struct Running {
    child: Child,
    stdout: Arc<Captured>,
    stderr: Arc<Captured>,
}

pub(crate) struct TheMachine;

pub(crate) static THE_MACHINE: TheMachine = TheMachine;

static CHILDREN: LazyLock<Mutex<HashMap<u64, Running>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
static NEXT: Mutex<u64> = Mutex::new(0);

fn collect(mut from: impl Read + Send + 'static) -> Arc<Captured> {
    let captured = Arc::new(Captured::default());
    let filling = Arc::clone(&captured);
    std::thread::spawn(move || {
        let mut chunk = [0_u8; 4096];
        while let Ok(read) = from.read(&mut chunk) {
            if read == 0 {
                break;
            }
            filling
                .bytes
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .extend_from_slice(&chunk[..read]);
        }
        filling.closed.store(true, std::sync::atomic::Ordering::Release);
    });
    captured
}

// Bytes still in a pipe when the program exits are read before the exit is
// reported, unless something it left behind holds the pipe open.
fn drained(streams: &[&Captured]) {
    let deadline = Instant::now() + DRAIN_GRACE;
    while Instant::now() < deadline
        && !streams
            .iter()
            .all(|stream| stream.closed.load(std::sync::atomic::Ordering::Acquire))
    {
        std::thread::sleep(POLL);
    }
}

impl Outside for TheMachine {
    fn ensure_program(&self, _program: &str) -> Result<(), String> {
        Ok(())
    }

    fn spawn_program(&self, spec: CommandSpec) -> Result<u64, String> {
        let mut command = Command::new(&spec.program);
        command
            .args(&spec.args)
            .envs(spec.env.iter().map(|(name, value)| (name, value)))
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if let Some(cwd) = &spec.cwd {
            command.current_dir(cwd);
        }
        let mut busy = 0;
        let mut child = loop {
            match command.spawn() {
                Err(error) if error.kind() == std::io::ErrorKind::ExecutableFileBusy && busy < MAX_BUSY => {
                    busy += 1;
                    std::thread::sleep(POLL);
                }
                spawned => break spawned.map_err(|error| format!("spawn {}: {error}", spec.program))?,
            }
        };
        let stdout = child.stdout.take().map(collect).unwrap_or_default();
        let stderr = child.stderr.take().map(collect).unwrap_or_default();
        let mut next = NEXT.lock().unwrap_or_else(PoisonError::into_inner);
        *next += 1;
        CHILDREN
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .insert(*next, Running { child, stdout, stderr });
        Ok(*next)
    }

    fn wait_program(&self, child: u64, timeout: Duration) -> Result<Option<i32>, String> {
        let started = Instant::now();
        loop {
            let (status, streams) = {
                let mut children = CHILDREN.lock().unwrap_or_else(PoisonError::into_inner);
                let running = children.get_mut(&child).ok_or("no such child")?;
                let streams = (Arc::clone(&running.stdout), Arc::clone(&running.stderr));
                (running.child.try_wait().map_err(|error| error.to_string())?, streams)
            };
            if let Some(status) = status {
                drained(&[&streams.0, &streams.1]);
                return Ok(Some(status.code().unwrap_or(-1)));
            }
            if started.elapsed() >= timeout {
                return Ok(None);
            }
            std::thread::sleep(POLL);
        }
    }

    fn read_program(&self, child: u64, stderr: bool, max_bytes: u32) -> Result<Vec<u8>, String> {
        let children = CHILDREN.lock().unwrap_or_else(PoisonError::into_inner);
        let running = children.get(&child).ok_or("no such child")?;
        let buffer = if stderr { &running.stderr } else { &running.stdout };
        let mut held = buffer.bytes.lock().unwrap_or_else(PoisonError::into_inner);
        let taken = held.len().min(max_bytes as usize);
        Ok(held.drain(..taken).collect())
    }

    fn kill_program(&self, child: u64, _force: bool) -> Result<(), String> {
        let mut children = CHILDREN.lock().unwrap_or_else(PoisonError::into_inner);
        let running = children.get_mut(&child).ok_or("no such child")?;
        running.child.kill().map_err(|error| error.to_string())
    }

    fn announce(&self, _service: LanService) -> Result<u64, String> {
        Err("no local network in a test".to_string())
    }

    fn withdraw(&self, _announcement: u64) {}

    fn search(&self, _target: &str, _wait: Duration) -> Result<Vec<LanReply>, String> {
        Err("no local network in a test".to_string())
    }

    fn addresses(&self) -> Vec<String> {
        Vec::new()
    }

    fn canonical(&self, path: &str) -> Option<String> {
        std::fs::canonicalize(path)
            .ok()
            .map(|path| path.to_string_lossy().into_owned())
    }

    fn copy(&self, source: &str, destination: &str) -> Result<u64, String> {
        std::fs::copy(source, destination).map_err(|error| error.to_string())
    }
}
