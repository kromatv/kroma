use std::fs::OpenOptions;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{Context as _, Result};

const LOCK_FILE: &str = ".sync-lock";
const ABANDONED_AFTER: Duration = Duration::from_secs(4 * 60);
const POLL_EVERY: Duration = Duration::from_millis(100);

pub(super) struct SyncLock {
    path: PathBuf,
}

impl SyncLock {
    pub(super) fn take(dir: &Path) -> Result<Self> {
        std::fs::create_dir_all(dir).context("create defs dir")?;
        let path = dir.join(LOCK_FILE);
        loop {
            match OpenOptions::new().write(true).create_new(true).open(&path) {
                Ok(_) => return Ok(Self { path }),
                Err(e) if e.kind() == ErrorKind::AlreadyExists => {
                    if is_abandoned(&path) {
                        let _ = std::fs::remove_file(&path);
                    } else {
                        std::thread::sleep(POLL_EVERY);
                    }
                }
                Err(e) => return Err(e).context("take the sync lock"),
            }
        }
    }
}

impl Drop for SyncLock {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

fn is_abandoned(lock: &Path) -> bool {
    std::fs::metadata(lock)
        .and_then(|meta| meta.modified())
        .is_ok_and(|at| at.elapsed().is_ok_and(|age| age > ABANDONED_AFTER))
}

#[cfg(test)]
mod tests {
    use std::fs::File;
    use std::sync::mpsc;
    use std::time::SystemTime;

    use super::super::test_support::tmpdir;
    use super::*;

    #[test]
    fn a_second_taker_waits_until_the_first_lets_go() {
        let dir = tmpdir("lock-wait");
        let first = SyncLock::take(dir.path()).unwrap();
        let (taken, heard) = mpsc::channel();
        let dir_path = dir.path().to_path_buf();

        let second = std::thread::spawn(move || {
            let lock = SyncLock::take(&dir_path).unwrap();
            taken.send(()).unwrap();
            lock
        });
        let while_held = heard.recv_timeout(POLL_EVERY * 3);
        drop(first);
        let once_free = heard.recv_timeout(Duration::from_secs(10));
        drop(second.join().unwrap());

        assert!(while_held.is_err());
        assert!(once_free.is_ok());
    }

    #[test]
    fn letting_go_removes_the_lock_file() {
        let dir = tmpdir("lock-release");

        drop(SyncLock::take(dir.path()).unwrap());

        assert!(!dir.path().join(LOCK_FILE).exists());
    }

    #[test]
    fn a_lock_its_holder_died_with_is_taken_over() {
        let dir = tmpdir("lock-abandoned");
        let lock = File::create(dir.path().join(LOCK_FILE)).unwrap();
        lock.set_modified(SystemTime::now() - ABANDONED_AFTER * 2)
            .unwrap();

        let taken = SyncLock::take(dir.path());

        assert!(taken.is_ok());
    }

    #[test]
    fn a_folder_that_cannot_be_created_is_an_error_rather_than_a_wait() {
        let dir = tmpdir("lock-no-folder");
        std::fs::write(dir.path().join("file"), "").unwrap();

        let taken = SyncLock::take(&dir.path().join("file").join("defs"));

        assert!(taken.is_err());
    }
}
