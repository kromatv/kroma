use std::cell::{Cell, RefCell};
use std::time::{Duration, SystemTime};

use kroma_testing::temp_dir;

use super::*;

const ABC_SHA256: &str = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

const PINNED_TO_ABC: PinnedFile<'static> = PinnedFile {
    name: "model.safetensors",
    sha256: ABC_SHA256,
};

struct Origin {
    body: &'static [u8],
    asked: RefCell<Vec<String>>,
    works: Cell<bool>,
}

impl Origin {
    fn serving(body: &'static [u8]) -> Self {
        Self {
            body,
            asked: RefCell::default(),
            works: Cell::new(true),
        }
    }

    fn down() -> Self {
        let origin = Self::serving(b"");
        origin.works.set(false);
        origin
    }

    fn fetch(&self, url: &str, dest: &Path) -> bool {
        self.asked.borrow_mut().push(url.to_string());
        self.works.get() && std::fs::write(dest, self.body).is_ok()
    }
}

fn leftovers(dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

fn locked(dir: &Path, age: Duration) {
    let lock = dir.join(format!("{}.lock", PINNED_TO_ABC.name));
    std::fs::write(&lock, b"").unwrap();
    std::fs::File::options()
        .write(true)
        .open(&lock)
        .unwrap()
        .set_modified(SystemTime::now() - age)
        .unwrap();
}

#[test]
fn keeps_a_file_that_matches_its_pin_without_fetching() {
    let dir = temp_dir("pinned");
    std::fs::write(dir.path().join(PINNED_TO_ABC.name), "abc").unwrap();
    let origin = Origin::serving(b"abc");

    let kept = ensure(dir.path(), &PINNED_TO_ABC, "u", &|u, d| origin.fetch(u, d));

    assert!(kept);
    assert!(origin.asked.borrow().is_empty());
}

#[test]
fn installs_a_download_that_matches_its_pin() {
    let dir = temp_dir("pinned");
    let origin = Origin::serving(b"abc");

    let installed = ensure(dir.path(), &PINNED_TO_ABC, "u", &|u, d| origin.fetch(u, d));

    assert!(installed);
    assert_eq!(leftovers(dir.path()), ["model.safetensors"]);
}

#[test]
fn downloads_again_over_a_file_cut_short() {
    let dir = temp_dir("pinned");
    std::fs::write(dir.path().join(PINNED_TO_ABC.name), "ab").unwrap();
    let origin = Origin::serving(b"abc");

    let repaired = ensure(dir.path(), &PINNED_TO_ABC, "u", &|u, d| origin.fetch(u, d));

    assert!(repaired);
    assert_eq!(std::fs::read(dir.path().join(PINNED_TO_ABC.name)).unwrap(), b"abc");
}

#[test]
fn deletes_a_download_with_other_bytes() {
    let dir = temp_dir("pinned");
    let origin = Origin::serving(b"abd");

    let installed = ensure(dir.path(), &PINNED_TO_ABC, "u", &|u, d| origin.fetch(u, d));

    assert!(!installed);
    assert!(leftovers(dir.path()).is_empty());
}

#[test]
fn deletes_a_download_that_stops_early() {
    let dir = temp_dir("pinned");
    let origin = Origin::serving(b"ab");

    let installed = ensure(dir.path(), &PINNED_TO_ABC, "u", &|u, d| origin.fetch(u, d));

    assert!(!installed);
    assert!(leftovers(dir.path()).is_empty());
}

#[test]
fn deletes_a_bad_file_even_when_the_download_fails() {
    let dir = temp_dir("pinned");
    std::fs::write(dir.path().join(PINNED_TO_ABC.name), "ab").unwrap();
    let origin = Origin::down();

    let installed = ensure(dir.path(), &PINNED_TO_ABC, "u", &|u, d| origin.fetch(u, d));

    assert!(!installed);
    assert!(leftovers(dir.path()).is_empty());
}

#[test]
fn leaves_a_file_another_caller_is_downloading_to_it() {
    let dir = temp_dir("pinned");
    locked(dir.path(), Duration::ZERO);
    let origin = Origin::serving(b"abc");

    let installed = ensure(dir.path(), &PINNED_TO_ABC, "u", &|u, d| origin.fetch(u, d));

    assert!(!installed);
    assert!(origin.asked.borrow().is_empty());
}

#[test]
fn takes_over_a_download_whose_caller_died_long_ago() {
    let dir = temp_dir("pinned");
    locked(dir.path(), LOCK_EXPIRES + Duration::from_secs(60));
    let origin = Origin::serving(b"abc");

    let installed = ensure(dir.path(), &PINNED_TO_ABC, "u", &|u, d| origin.fetch(u, d));

    assert!(installed);
    assert_eq!(leftovers(dir.path()), ["model.safetensors"]);
}
