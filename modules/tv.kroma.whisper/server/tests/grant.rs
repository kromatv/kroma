//! What this module's `storage.core` grant has to cover.
//!
//! `whisper_jobs` is a channel, not a table this module owns: a transcription
//! runs for minutes and drives live progress plus a mid-run cancel, which do not
//! fit the buffered request/response the port bridge speaks. The core writes
//! `cancel` and polls the rest; this sidecar does the reverse. Shared by
//! definition, so it lives in the core schema and this module holds a grant.

use kroma_module_sdk::db;

#[test]
fn the_grant_covers_both_ends_of_the_progress_channel() {
    let core = db::testing::temp_pool("whisper-grant");
    let grant = db::testing::grant_from_manifest(include_str!("../../module.json"));
    let conn = core.scoped("tv.kroma.whisper", &grant).get().unwrap();

    conn.execute(
        "INSERT OR REPLACE INTO whisper_jobs (id, stage, done, total, cancel) VALUES (?1,'',0,0,0)",
        ["wj-1"],
    )
    .unwrap();
    conn.execute(
        "UPDATE whisper_jobs SET stage = ?2, done = 0, total = 0 WHERE id = ?1",
        ["wj-1", "extract"],
    )
    .unwrap();
    conn.execute("UPDATE whisper_jobs SET done = 3, total = 9 WHERE id = ?1", ["wj-1"]).unwrap();
    let cancel: i64 = conn
        .query_row("SELECT cancel FROM whisper_jobs WHERE id = ?1", ["wj-1"], |r| r.get(0))
        .unwrap();
    assert_eq!(cancel, 0);
    conn.execute("DELETE FROM whisper_jobs WHERE id = ?1", ["wj-1"]).unwrap();

    // ...and nothing else. A transcriber has no business in the catalogue, let
    // alone in the accounts.
    for sql in
        ["SELECT token FROM sessions", "SELECT title FROM items", "SELECT value FROM settings"]
    {
        assert!(conn.prepare(sql).is_err(), "the grant must not reach: {sql}");
    }
}
