use std::time::Duration;

use kroma_wasm_host::HostError;

pub(crate) enum Outcome {
    Passed,
    Ignored(Option<String>),
    Failed,
}

pub(crate) struct Ran {
    name: String,
    outcome: Outcome,
    output: Vec<String>,
}

pub(crate) struct Report {
    ran: Vec<Ran>,
}

pub(crate) fn stopped(error: &HostError) -> String {
    let mut cause: &dyn std::error::Error = error;
    while let Some(source) = cause.source() {
        cause = source;
    }
    let last = cause.to_string();
    let last = last.lines().last().unwrap_or_default().trim().to_string();
    format!("the component stopped: {error}: {last}")
}

fn tally(lines: &[String]) -> Option<(usize, usize)> {
    let summary = lines
        .iter()
        .rev()
        .find_map(|line| line.strip_prefix("test result: "))?;
    let (_, counts) = summary.split_once(". ")?;
    let count = |label: &str| {
        counts
            .split("; ")
            .find_map(|part| part.strip_suffix(label)?.trim().parse().ok())
    };
    Some((count(" passed")?, count(" ignored")?))
}

fn reason(name: &str, lines: &[String]) -> Option<String> {
    let line = format!("test {name} ... ignored, ");
    lines
        .iter()
        .find_map(|seen| seen.strip_prefix(&line))
        .map(str::to_string)
}

impl Outcome {
    fn word(&self) -> String {
        match self {
            Self::Passed => "ok".to_string(),
            Self::Ignored(None) => "ignored".to_string(),
            Self::Ignored(Some(reason)) => format!("ignored, {reason}"),
            Self::Failed => "FAILED".to_string(),
        }
    }
}

impl Ran {
    pub(crate) fn read(name: &str, exit: Result<i32, HostError>, mut output: Vec<String>) -> Self {
        let outcome = match (&exit, tally(&output)) {
            (Ok(0), Some((1, 0))) => Outcome::Passed,
            (Ok(0), Some((0, 1))) => Outcome::Ignored(reason(name, &output)),
            _ => Outcome::Failed,
        };
        match exit {
            Err(error) => output.push(stopped(&error)),
            Ok(code) if code != 0 => output.push(format!("the test binary exited {code}")),
            Ok(_) => {}
        }
        Self {
            name: name.to_string(),
            outcome,
            output,
        }
    }

    pub(crate) fn print(&self, show_output: bool) {
        println!("test {} ... {}", self.name, self.outcome.word());
        if show_output && !matches!(self.outcome, Outcome::Failed) {
            for line in &self.output {
                println!("{line}");
            }
        }
    }
}

impl Report {
    pub(crate) fn of(mut ran: Vec<Ran>) -> Self {
        ran.sort_by(|a, b| a.name.cmp(&b.name));
        Self { ran }
    }

    fn count(&self, matches: fn(&Outcome) -> bool) -> usize {
        self.ran.iter().filter(|one| matches(&one.outcome)).count()
    }

    pub(crate) fn failed(&self) -> bool {
        self.count(|outcome| matches!(outcome, Outcome::Failed)) > 0
    }

    pub(crate) fn print(&self, elapsed: Duration) {
        let failures: Vec<&Ran> = self
            .ran
            .iter()
            .filter(|one| matches!(one.outcome, Outcome::Failed))
            .collect();
        if !failures.is_empty() {
            println!("\nfailures:\n");
            for one in &failures {
                println!("---- {} stdout ----", one.name);
                for line in &one.output {
                    println!("{line}");
                }
                println!();
            }
            println!("failures:");
            for one in &failures {
                println!("    {}", one.name);
            }
        }
        println!(
            "\ntest result: {}. {} passed; {} failed; {} ignored; finished in {:.2}s\n",
            if failures.is_empty() { "ok" } else { "FAILED" },
            self.count(|outcome| matches!(outcome, Outcome::Passed)),
            failures.len(),
            self.count(|outcome| matches!(outcome, Outcome::Ignored(_))),
            elapsed.as_secs_f64(),
        );
    }
}
