//! Adding by magnet or URL. rqbit answers that POST only once it holds the metadata,
//! which can take minutes, and one call to the host holds this module's only
//! instance for as long as it runs. So `curl`, a program the host starts, waits on
//! the POST, and the monitor asks how it went on its next tick.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};
use std::time::{Duration, Instant};

use anyhow::{Result, anyhow};
use kroma_module_sdk::host::process::{Child, Command};

use super::api::{AddOptions, Api, OUTLIVES_THE_CALLER_MS, TIMEOUT_HEADER};
use super::wire::Added;

const CURL: &str = "curl";
const BUDGET: Duration = Duration::from_secs(120);
const CONFIG_READ_WINDOW: Duration = Duration::from_secs(1);
const OUTPUT_BYTES: u32 = 1024 * 1024;
const CURL_TIMED_OUT: i32 = 28;
const STATUS_MARK: &str = "\nkroma-http-status:";

/// The add was handed over and has not landed yet. Ask again.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StillAdding;

impl std::fmt::Display for StillAdding {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("still looking for this torrent's metadata")
    }
}

impl std::error::Error for StillAdding {}

struct Job {
    child: Child,
    config: Option<PathBuf>,
    started: Instant,
    output: Vec<u8>,
}

pub(super) struct Adding {
    api: Api,
    work_dir: PathBuf,
    jobs: Mutex<HashMap<String, Job>>,
}

fn quoted(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for c in value.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\t' => out.push_str("\\t"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            _ => out.push(c),
        }
    }
    out.push('"');
    out
}

fn config_text(api: &Api, link: &str, options: &AddOptions<'_>) -> String {
    let rqbit_budget_ms = BUDGET.as_millis() + u128::from(OUTLIVES_THE_CALLER_MS);
    let url = api.url(&format!("/torrents?{}", options.query()));
    [
        format!("url = {}", quoted(&url)),
        format!("user = {}", quoted(api.credentials())),
        "request = \"POST\"".to_string(),
        format!("data-binary = {}", quoted(link)),
        format!(
            "header = {}",
            quoted(&format!("{TIMEOUT_HEADER}: {rqbit_budget_ms}"))
        ),
        format!("max-time = {}", BUDGET.as_secs()),
        "silent".to_string(),
        "show-error".to_string(),
        format!(
            "write-out = {}",
            quoted(&format!("{STATUS_MARK}%{{http_code}}"))
        ),
    ]
    .join("\n")
}

fn scrub(config: &mut Option<PathBuf>) {
    if let Some(path) = config.take() {
        let _ = std::fs::remove_file(path);
    }
}

fn config_path(work_dir: &Path, link: &str) -> PathBuf {
    work_dir.join(format!(
        "add-{}.curl",
        kroma_module_sdk::primitives::short_hash(link)
    ))
}

impl Job {
    fn start(api: &Api, work_dir: &Path, link: &str, options: &AddOptions<'_>) -> Result<Self> {
        std::fs::create_dir_all(work_dir)?;
        let config = config_path(work_dir, link);
        std::fs::write(&config, config_text(api, link, options))?;
        let spawned = Command::new(CURL)
            .args(["-q", "--config", &config.to_string_lossy()])
            .spawn();
        match spawned {
            Ok(child) => Ok(Self {
                child,
                config: Some(config),
                started: Instant::now(),
                output: Vec::new(),
            }),
            Err(reason) => {
                let _ = std::fs::remove_file(&config);
                Err(anyhow!(reason).context("start curl"))
            }
        }
    }

    fn collect_output(&mut self) {
        self.output.extend(self.child.read_stdout(OUTPUT_BYTES));
    }

    fn outcome(&mut self, code: i32) -> Option<Result<Added>> {
        self.collect_output();
        if code == CURL_TIMED_OUT {
            return Some(Err(anyhow!(
                "timed out adding torrent (magnet resolve slow?)"
            )));
        }
        if code != 0 {
            let said = String::from_utf8_lossy(&self.child.read_stderr(OUTPUT_BYTES)).into_owned();
            return Some(Err(anyhow!(
                "curl exited with code {code}: {}",
                said.trim()
            )));
        }
        let text = String::from_utf8_lossy(&self.output);
        let (body, status) = text.rsplit_once(STATUS_MARK)?;
        let answer = match status.trim().parse::<u16>() {
            Ok(status) if (200..300).contains(&status) => {
                serde_json::from_str::<Added>(body).map_err(anyhow::Error::from)
            }
            _ => Err(refused(body)),
        };
        Some(answer)
    }
}

fn refused(body: &str) -> anyhow::Error {
    let said: Option<String> = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|answer| answer.get("human_readable")?.as_str().map(str::to_string));
    anyhow!(
        "{}",
        said.unwrap_or_else(|| "rqbit refused the torrent".to_string())
    )
}

impl Adding {
    pub(super) fn new(api: Api, work_dir: PathBuf) -> Self {
        let _ = std::fs::remove_dir_all(&work_dir);
        Self {
            api,
            work_dir,
            jobs: Mutex::new(HashMap::new()),
        }
    }

    pub(super) fn start(&self, link: &str, options: &AddOptions<'_>) -> Result<()> {
        let job = Job::start(&self.api, &self.work_dir, link, options)?;
        self.jobs
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .insert(link.to_string(), job);
        Ok(())
    }

    /// How the add of this link is going: `None` when it was never handed over,
    /// [`StillAdding`] while it runs, and its info hash or its failure at the end.
    pub(super) fn poll(&self, link: &str) -> Option<Result<String>> {
        let mut jobs = self.jobs.lock().unwrap_or_else(PoisonError::into_inner);
        let job = jobs.get_mut(link)?;
        if job.started.elapsed() >= CONFIG_READ_WINDOW {
            scrub(&mut job.config);
        }
        let outcome = match job.child.try_wait() {
            Ok(ended) => ended.and_then(|code| job.outcome(code)),
            Err(reason) => Some(Err(anyhow!(reason))),
        };
        let Some(outcome) = outcome else {
            return Some(Err(StillAdding.into()));
        };
        if let Some(mut finished) = jobs.remove(link) {
            scrub(&mut finished.config);
        }
        Some(outcome.map(|added| added.details.info_hash))
    }

    /// Stop waiting on this link. A torrent that landed in the meantime has nobody
    /// left to answer for it, so it goes with its data.
    pub(super) fn cancel(&self, link: &str) {
        let job = self
            .jobs
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .remove(link);
        let Some(mut job) = job else {
            return;
        };
        scrub(&mut job.config);
        match job.child.try_wait() {
            Ok(Some(code)) => {
                if let Some(Ok(added)) = job.outcome(code) {
                    let _ = self.api.delete(&added.details.info_hash);
                }
            }
            _ => job.child.kill(),
        }
    }

    pub(super) fn cancel_all(&self) {
        let links: Vec<String> = self
            .jobs
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .keys()
            .cloned()
            .collect();
        for link in links {
            self.cancel(&link);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_value_cannot_end_its_own_line_in_the_config() {
        assert_eq!(
            quoted("a\"b\\c\nurl = evil"),
            "\"a\\\"b\\\\c\\nurl = evil\""
        );
    }

    #[test]
    fn the_password_is_in_the_config_file_and_the_status_is_asked_for() {
        let api = Api::new(1234, "hunter2");

        let text = config_text(&api, "magnet:?xt=urn:btih:ab", &AddOptions::default());

        assert!(text.contains("user = \"kroma:hunter2\""), "{text}");
        assert!(text.contains("write-out = "), "{text}");
        assert!(text.contains("x-req-timeout-ms: 125000"), "{text}");
    }
}
