use std::sync::{Arc, Mutex, PoisonError};
use std::thread;
use std::time::Instant;

use anyhow::{bail, Result};
use kroma_wasm_host::{CommandComponent, HostError, LogSink};

use crate::grant::TestWorld;
use crate::outcome::{Ran, Report};

const WHOLE_RUN_ONLY: [&str; 4] = ["--list", "--help", "-h", "--bench"];
const KEPT_FOR_EACH_TEST: [&str; 2] = ["--ignored", "--include-ignored"];
const SHOWING_OUTPUT: [&str; 2] = ["--nocapture", "--show-output"];
const THREADS_FLAG: &str = "--test-threads";

pub(crate) fn passes_through(args: &[String]) -> bool {
    args.iter()
        .any(|arg| WHOLE_RUN_ONLY.contains(&arg.as_str()))
}

pub(crate) struct Suite<'a> {
    binary: &'a CommandComponent,
    program: &'a str,
    args: &'a [String],
}

struct Captured {
    exit: Result<i32, HostError>,
    lines: Vec<String>,
}

impl<'a> Suite<'a> {
    pub(crate) fn new(binary: &'a CommandComponent, program: &'a str, args: &'a [String]) -> Self {
        Self {
            binary,
            program,
            args,
        }
    }

    fn argv(&self, rest: &[&str]) -> Vec<String> {
        std::iter::once(self.program)
            .chain(rest.iter().copied())
            .map(String::from)
            .collect()
    }

    fn capture(&self, argv: &[String]) -> Captured {
        let lines = Arc::new(Mutex::new(Vec::new()));
        let heard = Arc::clone(&lines);
        let sink: LogSink = Arc::new(move |line: &str| {
            heard
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .push(line.to_string());
        });
        let world = TestWorld::new();
        let exit = self.binary.run(world.grant(sink), argv);
        let lines = std::mem::take(&mut *lines.lock().unwrap_or_else(PoisonError::into_inner));
        Captured { exit, lines }
    }

    pub(crate) fn pass_through(&self) -> i32 {
        let argv = self.argv(&self.args.iter().map(String::as_str).collect::<Vec<_>>());
        let sink: LogSink = Arc::new(|line: &str| println!("{line}"));
        let world = TestWorld::new();
        match self.binary.run(world.grant(sink), &argv) {
            Ok(code) => code,
            Err(error) => {
                eprintln!("{}", crate::outcome::stopped(&error));
                i32::from(crate::FAILED)
            }
        }
    }

    fn listed(&self) -> Result<Vec<String>> {
        let mut rest: Vec<&str> = self.args.iter().map(String::as_str).collect();
        rest.extend(["--list", "--format", "terse"]);
        let listing = self.capture(&self.argv(&rest));
        match listing.exit {
            Ok(0) => Ok(listing
                .lines
                .iter()
                .filter_map(|line| line.strip_suffix(": test"))
                .map(String::from)
                .collect()),
            Ok(code) => bail!(
                "listing the tests exited {code}: {}",
                listing.lines.join("\n")
            ),
            Err(error) => bail!("listing the tests stopped: {error}"),
        }
    }

    fn run_one(&self, name: &str) -> Ran {
        let mut rest = vec![name, "--exact"];
        rest.extend(
            self.args
                .iter()
                .map(String::as_str)
                .filter(|arg| KEPT_FOR_EACH_TEST.contains(arg)),
        );
        let captured = self.capture(&self.argv(&rest));
        Ran::read(name, captured.exit, captured.lines)
    }

    fn threads(&self) -> usize {
        let named = self.args.iter().enumerate().find_map(|(at, arg)| {
            arg.strip_prefix(THREADS_FLAG)
                .and_then(|rest| rest.strip_prefix('='))
                .map(str::to_string)
                .or_else(|| {
                    (arg == THREADS_FLAG)
                        .then(|| self.args.get(at + 1).cloned())
                        .flatten()
                })
        });
        named
            .or_else(|| std::env::var("RUST_TEST_THREADS").ok())
            .and_then(|threads| threads.parse().ok())
            .unwrap_or_else(|| thread::available_parallelism().map_or(1, usize::from))
            .max(1)
    }

    pub(crate) fn run_each(&self) -> Result<i32> {
        let names = self.listed()?;
        let started = Instant::now();
        let show_output = self
            .args
            .iter()
            .any(|arg| SHOWING_OUTPUT.contains(&arg.as_str()));
        println!(
            "\nrunning {} test{}",
            names.len(),
            if names.len() == 1 { "" } else { "s" }
        );
        let queue = Mutex::new(names.into_iter());
        let ran = Mutex::new(Vec::new());
        thread::scope(|scope| {
            for _ in 0..self.threads() {
                scope.spawn(|| loop {
                    let next = queue.lock().unwrap_or_else(PoisonError::into_inner).next();
                    let Some(name) = next else { break };
                    let one = self.run_one(&name);
                    one.print(show_output);
                    ran.lock().unwrap_or_else(PoisonError::into_inner).push(one);
                });
            }
        });
        let report = Report::of(ran.into_inner().unwrap_or_else(PoisonError::into_inner));
        report.print(started.elapsed());
        Ok(if report.failed() {
            i32::from(crate::FAILED)
        } else {
            0
        })
    }
}
