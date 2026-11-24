//! A throwaway core database for one test, behind the `testing` feature.

pub use kroma_sqlite::testing::{grant_from_manifest, TempPool};

use crate::art_beside::{self, Picture};
use crate::Pool;

/// A fresh, migrated, empty core database no other test shares. `tag` only
/// shapes the directory name, to make a stray one identifiable.
pub fn temp_pool(tag: &str) -> TempPool {
    let dir = kroma_testing::temp_dir(tag);
    let pool = crate::init(&dir.path().join("kroma.db")).expect("init test db");
    TempPool::over(pool, dir)
}

/// Keep a picture beside the files of each `(subject kind, id, role)`, served
/// under `/api/images/beside-{id}-{role}.webp`, as a scan finds them.
pub fn keep_beside(pool: &Pool, pictures: &[(&'static str, &str, &'static str)]) {
    let pictures: Vec<Picture> = pictures
        .iter()
        .map(|(kind, id, role)| Picture {
            subject_kind: kind,
            subject_id: (*id).into(),
            library: "lib".into(),
            role,
            path: format!("/media/{id}/{role}.jpg"),
            url: format!("/api/images/beside-{id}-{role}.webp"),
        })
        .collect();
    art_beside::replace(pool, &pictures, &Default::default()).unwrap();
}
