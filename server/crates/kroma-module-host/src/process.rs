//! Starting a program from a module. The host starts it, and only if the module's
//! manifest declares it under `permissions.run`.

use std::time::Duration;

use crate::outside::{outside, CommandSpec};

const WAIT_STEP: Duration = Duration::from_millis(100);
const READ_ALL: u32 = 16 * 1024 * 1024;

/// Fetch or find `program`, as the manifest pins it. Call before the first start:
/// it can take a download's time.
pub fn ensure(program: &str) -> Result<(), String> {
    outside()?.ensure_program(program)
}

/// A program about to start, with no shell in the way.
#[derive(Debug, Clone, Default)]
pub struct Command(CommandSpec);

/// What a finished program left behind.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Output {
    pub code: i32,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
}

impl Command {
    pub fn new(program: impl Into<String>) -> Self {
        Self(CommandSpec {
            program: program.into(),
            ..CommandSpec::default()
        })
    }

    pub fn arg(mut self, arg: impl Into<String>) -> Self {
        self.0.args.push(arg.into());
        self
    }

    pub fn args<I, S>(mut self, args: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.0.args.extend(args.into_iter().map(Into::into));
        self
    }

    pub fn env(mut self, name: impl Into<String>, value: impl Into<String>) -> Self {
        self.0.env.push((name.into(), value.into()));
        self
    }

    pub fn current_dir(mut self, dir: impl Into<String>) -> Self {
        self.0.cwd = Some(dir.into());
        self
    }

    /// What this will ask the host to start.
    pub fn spec(&self) -> &CommandSpec {
        &self.0
    }

    /// Start it and keep going.
    pub fn spawn(&self) -> Result<Child, String> {
        outside()?.spawn_program(self.0.clone()).map(|id| Child { id })
    }

    /// Start it and wait up to `timeout` for it to end, killing it past that.
    pub fn output(&self, timeout: Duration) -> Result<Output, String> {
        let child = self.spawn()?;
        let Some(code) = child.wait_for(timeout)? else {
            child.kill();
            return Err(format!("{} ran past {timeout:?}", self.0.program));
        };
        Ok(Output {
            code,
            stdout: child.read_stdout(READ_ALL),
            stderr: child.read_stderr(READ_ALL),
        })
    }
}

/// A running program. Dropping this leaves it running: the host stops it when the
/// module stops, or when the instance that started it is lost.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Child {
    id: u64,
}

impl Child {
    /// This child among the module's others. It says nothing about the machine.
    pub fn id(&self) -> u64 {
        self.id
    }

    /// The exit code if it has ended, without waiting.
    pub fn try_wait(&self) -> Result<Option<i32>, String> {
        self.wait_for(Duration::ZERO)
    }

    /// The exit code if it ends within `timeout`.
    pub fn wait_for(&self, timeout: Duration) -> Result<Option<i32>, String> {
        outside()?.wait_program(self.id, timeout)
    }

    /// Wait for it to end while the module's other tasks run.
    pub async fn wait(&self) -> Result<i32, String> {
        loop {
            if let Some(code) = self.try_wait()? {
                return Ok(code);
            }
            tokio::time::sleep(WAIT_STEP).await;
        }
    }

    /// What it has written to stdout since the last read, up to `max_bytes`.
    pub fn read_stdout(&self, max_bytes: u32) -> Vec<u8> {
        outside()
            .and_then(|outside| outside.read_program(self.id, false, max_bytes))
            .unwrap_or_default()
    }

    /// What it has written to stderr since the last read, up to `max_bytes`.
    pub fn read_stderr(&self, max_bytes: u32) -> Vec<u8> {
        outside()
            .and_then(|outside| outside.read_program(self.id, true, max_bytes))
            .unwrap_or_default()
    }

    /// Ask it to stop.
    pub fn terminate(&self) {
        if let Ok(outside) = outside() {
            let _ = outside.kill_program(self.id, false);
        }
    }

    /// Stop it now.
    pub fn kill(&self) {
        if let Ok(outside) = outside() {
            let _ = outside.kill_program(self.id, true);
        }
    }
}
